var Buffer = buffer.Buffer;


//compare two arrays 
function isEqualArray(a, b) { if (a.length != b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] != b[i]) return false; return true; }

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
    "PEER_ID": '0'+sodium.to_base64(sodium.randombytes_buf(64))+'x',
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


function saveUserData() {
  fs.writeData(serialize(USERDATA));
}
