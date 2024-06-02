

class CryptoWrapper {
  constructor (sodium) {
    this._s = sodium;
  }
  encryptMessage(message, recipientPublicKey, privateKey, nonce) {
    nonce ??= this._s.randombytes_buf(this._s.crypto_box_NONCEBYTES);
    const encrypted = this._s.crypto_box_easy(message, nonce, recipientPublicKey, privateKey);
    return { encrypted, nonce };
  }

  // Decrypt message using own secret key and sender's public key
  decryptMessage(encrypted, nonce, senderPublicKey, privateKey) {
    let out = this._s.crypto_box_open_easy(encrypted, nonce, senderPublicKey, privateKey);
    return new TextDecoder().decode(out);
  }

  // Sign message using own secret key
  signMessage(message) {
    console.log(USERDATA.IDENTITY_KEY.privateKey)
    return this._s.crypto_sign_detached(message, USERDATA.IDENTITY_KEY.privateKey);
  }

  // Verify signature using sender's public key
  verifySignature(signature, message, senderPublicKey) {
    return this._s.crypto_sign_verify_detached(signature, message, senderPublicKey);
  }

}

//please finish
//TODO:
//add comments
//write comments explaining the purpose of each method, and what it does 
//add all necessary methods
//make it have the same general functionality as mainpeer
class WrappedPeer {

  constructor (id, options){
    this.id ??= USERDATA.PEER_ID || id || '0'+sodium.to_base64(sodium.randombytes_buf(62))+'x';
    options ??= {};
    this.peer = new Peer(this.id, options); // raw peer object
    this.connections = {};
    this.addPeerListeners();
    this.isPeerOpen = false;
    
  }

  addPeerListeners() {
    this.peer.on('open', () => {
      this.isPeerOpen = true;      
    });
    this.peer.on('disconnected', () => {
      this.isPeerOpen = false;
    });
    this.peer.on('connection', (dataConnection) => {
      addConnection(dataConnection.peer, null, dataConnection);
    })
    this.peer.on('error', (err) => {
      console.log('error:',err);
    });
    this.peer.on('close', () => {
      this.isPeerOpen = false;
    });
  }

  addListeners(connObj) {
    connObj.on('open', () => {
      this.connections[connObj.peer].open = true;
    })
    connObj.on('data', (data) => doData(data, id));
    connObj.on('close', () => {
      this.connections[connObj.peer].open = false;
      this.connections[connObj.peer].connected = false;
    })
  }

  addConnection(id, options, connObj) {
    options ??= {};
    connObj ??= this.peer.connect(id, options);
    this.connections[id] = {
      connObj,
      connected: true,
      open: false,
      handshakeLevel: 0
    };
    if (!USERDATA.known_users[id]) {
      USERDATA.known_users[id] = {
        
      }
    }
    
    addListeners(connObj);
  }

  connect (id, options) {
    this.addConnection(id, options);
  }
  doData (data, id) {
    if (this.connections[id].handshakeLevel < 4) {
      //handshake code
      doHandshake(data, id);
      return;
    }
    let receivedMessage = new Message(id, data);
    if (cw.verifySignature(data.data, data.signature.data, USERDATA.known_users[id].publicKey)) {
      this.connections[id].connObj.send(data);
    }
  }
}


class Message {
  constructor(peerId, data) {
    console.log(data);
    this.authorizedEntries = ['peerId', 'data', 'signature', 'timestamp', 'type', 'callbackId','nonce','encrypted'];
    //set all authorized data entries to Message object
    for (const [key, value] of Object.entries({...data,peerId})) {
      if (this[key] || !this.authorizedEntries.includes(key)) continue;
      this[key] = value;
    }
    console.log(this);

    if (!this.encrypted) {
      if (this.type != "handshake"); //return; //unencrypted packet - insecure - drop packet 
      else {
      }
    }
    
  }
}

//===========================================
//OLD CODE: USE THIS FOR REFERENCE ON FUNCTIONALITY 
//USE NEW IMPLEMENTATION IN WrappedPeer
//===========================================



class Mainpeer {
  /**
   * Represents a MainPeer object.
   * @constructor
   * @param {string} hexEcdsaPublicKey - The hexadecimal representation of the ECDSA public key.
   * @param {string} hexEcdsaPrivateKey - The hexadecimal representation of the ECDSA private key.
   */
  constructor(hexEcdsaPublicKey, hexEcdsaPrivateKey) {
    this.hexEcdsaPublicKey = hexEcdsaPublicKey;
    this.hexEcdsaPrivateKey = hexEcdsaPrivateKey;
    this.peers = [];

    this.id = hexEcdsaPublicKey;
    this.raw = new Peer(this.id);
  }

  /**
   * Waits for the initialization of the main peer.
   * @returns {Promise<void>} A promise that resolves when the initialization is complete.
   */
  async waitForInit() {
    while (this.init < 3) {
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
    }
  }

  /**
   * Parses the given message and performs the appropriate actions based on the message type.
   * @param {string} message - The message to parse.
   */
  parse(message) {
    const type = MessageBuilder.findType(message);
    message = JSON.parse(message);
    console.log(message);
    if (message.to !== this.id) {
      // this is literally just the simplest way to implement gossip in the future lmao
      console.log("Message not for us");
      return;
    }
    switch (type) {
      case "connect":
        const other = new Otherpeer(this.raw, message.from);
        other.init();
        other.waitForInit().then(async () => {
          console.log(other);
          const verified = await verify(
            hexToArrayBuffer(message.sig),
            new TextEncoder().encode([other.id, this.id].join("")),
            other.publicKey
          );
          if (!verified) {
            console.log("Invalid signature");
            return;
          }
          this.peers.push(other);
          sign(
            new TextEncoder().encode([this.id, message.from].join("")),
            this.privateKey
          ).then(async (signature) => {
            other.connect(
              MessageBuilder.confirmConnection(
                this.hexEcdsaPublicKey,
                arrayBufferToHex(signature),
                other.id
              )
            );
          });
        });
        break;
      case "confirmConnection":
        const peerIndex = this.findPeerIndex(message.from);
        if (peerIndex === -1) {
          console.log("Unknown peer attempting to connect");
          return;
        }
        verify(
          hexToArrayBuffer(message.sig),
          new TextEncoder().encode([message.from, this.id].join("")),
          this.peers[peerIndex].publicKey
        ).then((verified) => {
          if (!verified) {
            console.log("Invalid signature");
            return;
          }
          this.peers[peerIndex].fullyConnected = true;
          this._send(
            peerIndex,
            MessageBuilder.fullyConnected(this.id, message.from)
          );
        });
        break;
      case "fullyConnected":
        const index = this.findPeerIndex(message.from);
        if (index === -1) {
          console.log("Unknown peer attempting to connect");
          return;
        }
        this.peers[index].fullyConnected = true;
        break;
      default:
        console.log("Unknown message type");
        console.log(message);
        break;
    }
  }

  /**
   * Initializes the main peer.
   */
  init() {
    this.init = 0;
    this.raw.on("connection", (con) => {
      con.on("data", (x) => {
        this.parse(x);
      });
    });
    this.raw.on("open", (x) => {
      this.init++;
    });
    importKeys(true, hexToArrayBuffer(this.hexEcdsaPublicKey)).then(
      (publicKey) => {
        this.publicKey = publicKey;
        this.init++;
      }
    );
    importKeys(false, hexToArrayBuffer(this.hexEcdsaPrivateKey)).then(
      (privateKey) => {
        this.privateKey = privateKey;
        this.init++;
      }
    );
  }

  /**
   * Connects to another peer with the given ID.
   * 
   * @param {string} id - The ID of the peer to connect to.
   */
  connect(id) {
    if (this.init < 3) {
      console.log("Not ready");
      return;
    }
    sign(
      new TextEncoder().encode([this.id, id].join("")).buffer,
      this.privateKey
    ).then((signature) => {
      const other = new Otherpeer(this.raw, id);
      this.peers.push(other);
      other.init().then(() => {
        other.connect(
          MessageBuilder.connect(
            this.hexEcdsaPublicKey,
            arrayBufferToHex(signature),
            other.id
          )
        );
      });
    });
  }

  _send(index, message) {
    if (this.peers[index].connection) {
      this.peers[index].connection.send(message);
    }
  }
  /**
   * Finds the index of a peer with the specified ID.
   * @param {string} id - The ID of the peer to find.
   * @returns {number} - The index of the peer if found, otherwise -1.
   */
  findPeerIndex(id) {
    for (let i = 0; i < this.peers.length; i++) {
      if (this.peers[i].id === id) {
        return i;
      }
    }
    return -1;
  }
}



