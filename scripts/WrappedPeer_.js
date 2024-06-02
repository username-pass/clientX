class WrappedPeer_{
  constructor (id, options) {

    options ??= {};
    

    // Options object for Peer constructor
    options = {
      ...options,
    };

    //create peerId 
    this.id ??= USERDATA.PEER_ID || id || '0'+sodium.to_base64(sodium.randombytes_buf(62))+'x';
    this.peer = new Peer(this.id, options); // raw peer object 
    this.connectionsManager = new ConnectionsManager(this.peer); //connection manager 
    this.initListeners(); //add listeners for th peer object
  }
  initListeners () {
    this.peer.on('disconnected', () => {
      this.disconnect(true);
    });
    this.peer.on('close', () => {
      this.disconnect(true);
    });
    this.peer.on('error', (err) => {
      if (err.type == 'disconnected') this.disconnect(true);
      console.log(err);
    });
    this.peer.on('connection', (dataConnection) => {
      this.connectionsManager.addConnection(dataConnection.peer, null, dataConnection);
    });
    this.peer.on('call', (mediaConnection) => {
      this.connectionsManager.addCall(mediaConnection.peer, null, null, mediaConnection);
    });
  }
  connect (peerId, options) { //connect to a new peer by Id
    console.log(0)
    this.connectionsManager.addConnection(peerId, options);
    //do handshake 
    //this.connectionsManager.doHandshake(peerId);
  }
  disconnect (alreadyDisconnected = false) {
    this.connectionsManager.setDisconnected();
    if (!alreadyDisconnected) this.peer.disconnect();
  }
  call (peerId, stream, options) {
    this.connectionsManager.addCall(peerId, stream, options);
  }
  sendData(peerId, data, callback) {
    this.connectionsManager.sendData(peerId, data, callback);
  }
}

class ConnectionsManager_ {
  constructor (peerObj) {
    this.peerObj = peerObj;
    this.connections = {};
    this.defaultCallbacks = {};
    this.defaultConnection = {
      connected: false,
      hasCall: false,
      handshakeStage: 0,
      connectionObject: {},
      callbacks: {}
    }
  }

  createDefaultCallbacks() {
    this.defaultCallbacks = {
      "handshake": (data, peerId) => {},
      "data": (data, peerId) => {},
      "*": (data, peerId) => {
        console.log(data, peerId);
        this.sendData(peerId, data);
      }
      //list of all types of callbacks that would be useful when sending data between peers 
      //1: handshake
      //2: data
      //3: status
      //4: error

    }
  }

  // connect to new peer with id (or, if receiving a connection, add a new connection with an alredy generated connection object)
  addConnection(peerId, options, connectionObject) {
    if (this.connections[peerId] && this.connections[peerId].connected) return; //already connected, return
    if (!this.connections[peerId]) this.connections[peerId] = {...this.defaultConnection}; // create a new connection in the connections object (for keeping track of connections)

    options ??= {};
    options.metadata ??= {};
    options.metadata = {
      ...options.metadata,
      publicKey: USERDATA.IDENTITY_KEY.publicKey //set the publicKey (for handshake later)
    }
    // if it's not an already known user, add to known user list 
    // this bit can be ignored
    if (!USERDATA.known_users[peerId]) {
      //not a known peer 
      USERDATA.known_users[peerId] = {
        trusted: false,
        handshaked: false,
        notes: "",
        display_name: peerId,
        nickname: "",
        id: peerId,
        session_keypair: {
          //our_keypair: {},
          //their_public_key: ""
        }
      }
    }
    //set it to connection object, if it exists (receiving connection)
    this.connections[peerId].connectionObject = connectionObject
    //if it's not already connected, connect to the id 
    this.connections[peerId].connectionObject ??= this.peerObj.connect(peerId, options);

    this.connections[peerId].connectionObject.on('error', (err) => {
      console.log(err);
    })
    //testing to see if it opens (This event never fires)
    //this.connections[peerId].connectionObject.on('open', () => {
    //  alert("TESTING")
    //})

    this.addDataListeners(peerId);
    saveUserData();
  }
  sendData(message, callback) {
    let data = message.data;
    let peerId = message.peerId;

    let callbackId = sodium.to_base64(sodium.randombytes_buf(64));
    this.connections[peerId].connectionObject.send({...data, callbackId});
    this.connections[peerId].callbacks[callbackId] = callback;
  }

  middleware (data, peerId) {
    console.log("received data",data,"from",peerId);
    return data;
  }

  doData(peerId, data) {
    if (this.connections[peerId].handshakeStage < 5) {
      if (data.type != "handshake") return;
      //do handshake 

    }
    this.runHandler(data.type, peerId, this.middleware(data, peerId) || data);
  }

  runHandler(type, peerId, data) {
    if (this.connections[peerId].callbacks[data.callbackId]) {
      this.connections[peerId].callbacks[data.callbackId](data, peerId);
      delete this.connections[peerId].callbacks[data.callbackId];
    } else
    if (this.defaultCallbacks[type]) {
      this.defaultCallbacks[type](data, peerId);
    } else 
    if (this.defaultCallbacks["*"]) {
      this.defaultCallbacks["*"](data, peerId);
    }
  }

  async addDataListeners(peerId) {
    return new Promise((resolve, reject) => {
      console.log(0.5, this.connections[peerId])

      this.connections[peerId].connectionObject.on('open', () => {
        alert("TESTING")
        resolve();
      });
      this.connections[peerId].connectionObject.on('data', (data) => {
        this.doData(peerId, data);
      })
    })
  }

  doHandshake(peerId) {
    if (USERDATA.known_users[peerId].handshaked == false) {
      //do add user handshake 
    } else {
      //generate keypair with size 4096
      let keypair = sodium.crypto_box_keypair();
      USERDATA.known_users[peerId].session_keypair = {
        our_keypair: keypair
      }
      this.sendData(peerId, {
        type: "handshake",
        data: {
          stage: 0,
          publicKey: keypair.publicKey,
          publicKey_signed: cw.signMessage(sodium.to_base64(keypair.publicKey))
        }
      }, (data) => {
        console.log(data);
      })
    }
  }

  addCall (peerId, stream, options, mediaConnection = null) {
    if (!this.connections[peerId] || !this.connections[peerId].connected) this.addConnection(peerId, options); // if not connected, connect
    if (this.connections[peerId] && this.connections[peerId].connected && this.connections[peerId].hasCall) return;
    this.connections[peerId].mediaConnection = mediaConnection || this.peerObj.call(peerId, stream, options);
  }
}

class Message_ {
  constructor (peerId, type, data, callback) {
    if (typeof data != "object") data = {data: data}; // force it to be an object 
    this.peerId = peerId
    this.type = type
    this.data = JSON.stringify(data) // data
    this.callback = callback
    this.encryptData();
  }
  encryptData () {
    this.data = cw.encryptMessage(this.data, USERDATA.known_users[this.peerId].session_keypair.our_keypair);
  }
}
