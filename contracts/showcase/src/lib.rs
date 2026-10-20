#![no_std]
//! A Soroban contract whose job is to be *looked at*.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Bytes, Env, Map,
    String, Symbol, Vec,
};

const DAY_IN_LEDGERS: u32 = 17_280;
const PERSISTENT_THRESHOLD: u32 = DAY_IN_LEDGERS * 30;
const PERSISTENT_EXTEND_TO: u32 = DAY_IN_LEDGERS * 90;
const MAX_NOTE_LEN: u32 = 200;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NoteTooLong = 3,
    NoSuchNote = 4,
    Deliberate = 5,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Counter,
    Note(Symbol),
    Values,
    Labels,
    Session(Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Note {
    pub author: Address,
    pub body: String,
    pub revision: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Stats {
    pub counter: u32,
    pub admin: Address,
    pub contract: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Initialized {
    #[topic]
    pub admin: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Bumped {
    pub counter: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NoteWritten {
    #[topic]
    pub name: Symbol,
    #[topic]
    pub author: Address,
    pub revision: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NoteDeleted {
    #[topic]
    pub name: Symbol,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionStarted {
    #[topic]
    pub who: Address,
    pub expires_at: u32,
}

/// A positional payload that exercises the `vec` event data format.
#[contractevent(data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AmountsTallied {
    pub count: u32,
    pub total: i128,
}

/// A bare scalar payload that exercises the `single-value` event data format.
#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CounterValue {
    pub counter: u32,
}

#[contract]
pub struct Showcase;

#[contractimpl]
impl Showcase {
    pub fn init(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Counter, &0u32);
        Initialized {
            admin: admin.clone(),
        }
        .publish(&env);
        Ok(())
    }

    pub fn admin(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }

    pub fn bump(env: Env, by: u32) -> u32 {
        let current: u32 = env.storage().instance().get(&DataKey::Counter).unwrap_or(0);
        let next = current.saturating_add(by);
        env.storage().instance().set(&DataKey::Counter, &next);
        env.storage()
            .instance()
            .extend_ttl(PERSISTENT_THRESHOLD, PERSISTENT_EXTEND_TO);
        Bumped { counter: next }.publish(&env);
        CounterValue { counter: next }.publish(&env);
        next
    }

    pub fn put_note(env: Env, author: Address, name: Symbol, body: String) -> Result<u32, Error> {
        author.require_auth();
        if body.len() > MAX_NOTE_LEN {
            return Err(Error::NoteTooLong);
        }

        let key = DataKey::Note(name.clone());
        let revision = match env.storage().persistent().get::<_, Note>(&key) {
            Some(existing) => existing.revision.saturating_add(1),
            None => 1,
        };

        env.storage().persistent().set(
            &key,
            &Note {
                author: author.clone(),
                body,
                revision,
            },
        );
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_EXTEND_TO);
        NoteWritten {
            name,
            author,
            revision,
        }
        .publish(&env);
        Ok(revision)
    }

    pub fn note(env: Env, name: Symbol) -> Result<Note, Error> {
        let key = DataKey::Note(name);
        let note = env
            .storage()
            .persistent()
            .get::<_, Note>(&key)
            .ok_or(Error::NoSuchNote)?;
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_EXTEND_TO);
        Ok(note)
    }

    pub fn delete_note(env: Env, name: Symbol) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        let key = DataKey::Note(name.clone());
        if !env.storage().persistent().has(&key) {
            return Err(Error::NoSuchNote);
        }
        env.storage().persistent().remove(&key);
        NoteDeleted { name }.publish(&env);
        Ok(())
    }

    pub fn start_session(env: Env, who: Address, ledgers: u32) {
        let key = DataKey::Session(who.clone());
        let expires_at = env.ledger().sequence().saturating_add(ledgers.max(1));
        env.storage().temporary().set(&key, &expires_at);
        env.storage()
            .temporary()
            .extend_ttl(&key, ledgers.max(1), ledgers.max(1));
        SessionStarted { who, expires_at }.publish(&env);
    }

    pub fn session(env: Env, who: Address) -> Option<u32> {
        env.storage().temporary().get(&DataKey::Session(who))
    }

    pub fn revisions(env: Env, names: Vec<Symbol>) -> Map<Symbol, u32> {
        let mut out = Map::new(&env);
        for name in names.iter() {
            if let Some(note) = env
                .storage()
                .persistent()
                .get::<_, Note>(&DataKey::Note(name.clone()))
            {
                out.set(name, note.revision);
            }
        }
        out
    }

    /// Store a Vec and a Map as separate persistent entries so Prism's storage
    /// panel has both compound ScVal shapes to render.
    pub fn store_collections(env: Env, values: Vec<i128>, labels: Map<Symbol, String>) {
        let values_key = DataKey::Values;
        let labels_key = DataKey::Labels;
        env.storage().persistent().set(&values_key, &values);
        env.storage().persistent().set(&labels_key, &labels);
        env.storage().persistent().extend_ttl(
            &values_key,
            PERSISTENT_THRESHOLD,
            PERSISTENT_EXTEND_TO,
        );
        env.storage().persistent().extend_ttl(
            &labels_key,
            PERSISTENT_THRESHOLD,
            PERSISTENT_EXTEND_TO,
        );
    }

    pub fn stored_values(env: Env) -> Vec<i128> {
        env.storage()
            .persistent()
            .get(&DataKey::Values)
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn stored_labels(env: Env) -> Map<Symbol, String> {
        env.storage()
            .persistent()
            .get(&DataKey::Labels)
            .unwrap_or_else(|| Map::new(&env))
    }

    pub fn tally(env: Env, amounts: Vec<i128>) -> i128 {
        let mut total: i128 = 0;
        for amount in amounts.iter() {
            total = total.saturating_add(amount);
        }
        AmountsTallied {
            count: amounts.len(),
            total,
        }
        .publish(&env);
        total
    }

    pub fn checksum(blob: Bytes) -> u32 {
        let mut acc: u32 = 0;
        for byte in blob.iter() {
            acc ^= byte as u32;
        }
        acc
    }

    pub fn stats(env: Env) -> Result<Stats, Error> {
        Ok(Stats {
            counter: env.storage().instance().get(&DataKey::Counter).unwrap_or(0),
            admin: env
                .storage()
                .instance()
                .get(&DataKey::Admin)
                .ok_or(Error::NotInitialized)?,
            contract: env.current_contract_address(),
        })
    }

    pub fn boom() -> Result<(), Error> {
        Err(Error::Deliberate)
    }
}

mod test;
