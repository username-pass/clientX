var Buffer = buffer.Buffer;


//compare two arrays 
function isEqualArray(a, b) { if (a.length != b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] != b[i]) return false; return true; }

function StringXOR(a, b) {
    
    // Convert strings to Uint8Array
    const aBytes = sodium.from_string(a);
    const bBytes = sodium.from_string(b);

    // Ensure the strings are of the same length
    if (a.length !== b.length) {
        throw new Error("Input strings must have the same length");
    }

    // Perform XOR operation
    const resultBytes = new Uint8Array(aBytes.length);
    for (let i = 0; i < aBytes.length; i++) {
        resultBytes[i] = aBytes[i] ^ bBytes[i];
    }

    // Convert the result back to a string and return
    return sodium.to_base64(resultBytes);
}


function loadEruda() {
  // Create a script element for Eruda
  var script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/eruda';
  script.onload = function() {
    // Initialize Eruda
    eruda.init();
  };
  // Append the script to the document body
  document.body.appendChild(script);
}

//create a new user data profile
function newUserData () {
  const {publicKey, privateKey} = sodium.crypto_sign_keypair();
  const peer_random = sodium.to_base64(sodium.randombytes_buf(64));
  const peer_id = '0'+peer_random+' '+sodium.to_base64(cw.signMessage(peer_random,privateKey))+'x';
  const out = JSON.stringify({
    "MASTER_KEY": {
      "__type": "Uint8Array",
      "data": sodium.to_base64(MASTER_KEY)
    },
    "IDENTITY_KEY": {
      "publicKey": {
        "__type": "Uint8Array",
        "data": Buffer.from(publicKey).toString('base64')
      },
      "privateKey": {
        "__type": "Uint8Array",
        "data": Buffer.from(privateKey).toString('base64')
      },
      "keyType": "ed25519"
    },
    "PEER_ID": peer_id,
    "META": {
      "formatVersion": 1,
      "version": {}
    },
    "known_users": {},
    "channels": {}
  })

  return deserialize(out)
}


//serialize JSON data while preserving Uint8Arrays
function serialize(data) {
  // Convert Uint8Arrays to base64 strings
  const serializedData = JSON.stringify(data, (key, value) => {
    if (value instanceof Uint8Array) {
      return { __type: 'Uint8Array', data: Buffer.from(value).toString('base64') };
    }
    return value;
  },2);
  return serializedData;
}

//deserialize String of JSON data while preserving Uint8Arrays
function deserialize(string) {
  // Convert base64 strings back to Uint8Arrays
  const deserializedData = JSON.parse(string, (key, value) => {
    if (typeof value === 'object' && value !== null && value.__type === 'Uint8Array') {
      return Uint8Array.from(Buffer.from(value.data, 'base64'));
    }else 
      if (typeof value === 'object' && value !== null && value.__type === 'Version') {
        return new Version(value);
      }
    return value;
  });
  return deserializedData;
}

// Function to derive a key from a password
async function deriveKey(password, salt) {
  const passwordBytes = sodium.from_string(password);
  const opslimit = sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE;
  const memlimit = sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE;
  const algo = sodium.crypto_pwhash_ALG_ARGON2I13;
  const keyLength = sodium.crypto_secretbox_KEYBYTES;

  const key = sodium.crypto_pwhash(
    keyLength, 
    passwordBytes, 
    salt, 
    opslimit, 
    memlimit, 
    algo
  );

  return key;
}

// Function to encrypt data
async function encryptDataWithPassword(password, data) {
  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  const key = await deriveKey(password, salt);
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const encryptedData = sodium.crypto_secretbox_easy(data, nonce, key);

  // Combine salt, nonce, and encrypted data for storage/transmission
  const combined = new Uint8Array(salt.length + nonce.length + encryptedData.length);
  combined.set(salt);
  combined.set(nonce, salt.length);
  combined.set(encryptedData, salt.length + nonce.length);

  return combined;
}

// Function to decrypt data
async function decryptDataWithPassword(password, combined) {
  const saltLength = sodium.crypto_pwhash_SALTBYTES;
  const nonceLength = sodium.crypto_secretbox_NONCEBYTES;
  const salt = combined.slice(0, saltLength);
  const nonce = combined.slice(saltLength, saltLength + nonceLength);
  const encryptedData = combined.slice(saltLength + nonceLength);

  const key = await deriveKey(password, salt);
  const decryptedData = sodium.crypto_secretbox_open_easy(encryptedData, nonce, key);

  if (!decryptedData) {
    throw new Error('Decryption failed');
  }

  return decryptedData;
}


function encrypt_user_data(data) {
  return data;
}

function decrypt_user_data(data) {

  return data;
}

function saveUserData() {
  fs.writeData(encrypt_user_data(serialize(USERDATA)));
}
