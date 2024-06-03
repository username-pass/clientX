class WrappedPeer {
  constructor(id, options) {
    this.id = USERDATA.PEER_ID || id || '0' + sodium.to_base64(sodium.randombytes_buf(62)) + 'x';
    options ??= {};
    this.peer = new Peer(this.id, options); // raw peer object
    this.connections = {};
    this.cw = new CryptoWrapper(sodium); // Initialize CryptoWrapper
    this.identityKeyPair = USERDATA.IDENTITY_KEY; // Generate identity key pair
    this.identityKeyPair = sodium.crypto_box_keypair();
    this.addPeerListeners();
    this.isPeerOpen = false;
    this.defaultHandlers = this.getDefaultHandlers();
  }

  getDefaultHandlers() {
    return {
      'message': (peerId, req) => {
        console.log('got message',req.data)
      },
      'update-request': (peerId, req) => {
        let returnCallback = req.callbackId;
        let returnData = {
          VERSION,
          originalDoc
        }
        let returnMessage = new Message(this.getMutualChannel(peerId), returnData, 'version-update', {code: 200, message: 'new version returned'}, returnCallback);
        this.sendMessage(returnMessage);
      },
      'version-update': (peerId, req) => {
        console.log('got version update',req.data);

      }
    }
  }

  findPeers () {
    console.log(USERDATA.known_users);
    Object.keys(USERDATA.known_users).forEach((peerId) => {
      this.addConnection(peerId); 
    })
  }

  addPeerListeners() {
    this.peer.on('open', () => {
      this.isPeerOpen = true;
      //this.addConnection(this.peer.id);
      this.findPeers();
    });
    this.peer.on('disconnected', () => {
      this.isPeerOpen = false;
    });
    this.peer.on('connection', (dataConnection) => {
      this.addConnection(dataConnection.peer, {}, dataConnection);
    });
    this.peer.on('error', (err) => {
      //console.log('error:', err);
      console.log("error: ",err.type);

      if (err.type == "peer-unavailable") {
        let id = err.toString().match(/Could not connect to peer (.*)/)[1];
        console.log(id);
        //TODO: add clean option, then do the deleting of unessary connections
        // delete this.connections[id]
      }

    });
    this.peer.on('close', () => {
      this.isPeerOpen = false;
    });
  }

  connect(peerId,options) {
    this.addConnection(peerId, options);
    return peerId;
  }

  addConnection(peerId, options, dataConnection) {
    console.log('Adding connection:', peerId);
    //initHandshake is if you are initiating the connection
    let isInitiator = false;
    if (!dataConnection) {
      isInitiator = true;
    }
    let firstHandshakeAckRequest = null;
    // if the connection exists, add it to the connections, and add listeners 
    //if the connection does not exist, connect to peer, if it connects, then add it to the connections, add listeners, and initiate handshake 

    if (!isInitiator) {

      this.connections[peerId] = {
        connection: dataConnection,
        isHandshakeComplete: false,
        ourKeyPair: sodium.crypto_box_keypair(),
        theirPublicKey: sodium.from_base64(dataConnection.metadata.A.publicKey),
        theirIdentityKey: sodium.from_base64(dataConnection.metadata.A.identityKey),
        theirSignedPublicKey: sodium.from_base64(dataConnection.metadata.A.signedPublicKey),
        handshakeStage: 0,
        open: false 
      };
      dataConnection.metadata.B ??= {}; 
      dataConnection.metadata.B.publicKey = sodium.to_base64(this.connections[peerId].ourKeyPair.publicKey);
      dataConnection.metadata.B.identityKey = sodium.to_base64(USERDATA.IDENTITY_KEY.publicKey);
      dataConnection.metadata.B.signedPublicKey = sodium.to_base64(cw.signMessage(dataConnection.metadata.B.publicKey));
      dataConnection.metadata.B.version = {
        string: VERSION.version_string,
        signed: VERSION.signed_version_string
      }
      this.connections[peerId].role = {
        us: "B",
        them: "A"
      }

      const isNewUser = !USERDATA.known_users[peerId];
      if (isNewUser) {
        USERDATA.known_users[peerId] = {
          identityKey: this.connections[peerId].theirIdentityKey,
          isTrusted: false,
          notes: "",
          displayName: peerId.substr(0, 20),
          nickname: peerId.substr(0, 20),
          id: peerId,
          signedId: cw.signMessage(peerId+"signed_id"),
          channels: []
        }
      }
      //make special channel
      this.newChannel(peerId);
      saveUserData();

      //verify their data 
      //cw.verifySignature(signedData, data, publicKey)
      let [ID, signedID] = dataConnection.peer.slice(1,-1).split(' '); //get all but the first and last characters of the id
      signedID = sodium.from_base64(signedID);
      const isIdentityKeyValid = cw.verifySignature(signedID, ID, this.connections[peerId].theirIdentityKey) &&
        cw.verifySignature(this.connections[peerId].theirSignedPublicKey, sodium.to_base64(this.connections[peerId].theirPublicKey), this.connections[peerId].theirIdentityKey) &&
        (isNewUser || isEqualArray(USERDATA.known_users[peerId].identityKey, this.connections[peerId].theirIdentityKey));
      if (!isIdentityKeyValid) return; //TODO: better invalid key handling


      this.connections[peerId].handshakeStage = 1;
      firstHandshakeAckRequest = {
        type: "handshake",
        status: {
          code: 200,
          message: "your identity key is valid"
        },
        data: {
          B: dataConnection.metadata.B,
        }
      };
      console.log("handshake part 1, finished");
      if (this.connections[peerId].open) {
        dataConnection.send(firstHandshakeAckRequest);
      }
    } else {
      options ??= {};
      options.metadata ??= {}
      options.metadata.A ??= {};
      this.connections[peerId] = {
        connection: null,
        isHandshakeComplete: false,
        ourKeyPair: sodium.crypto_box_keypair(),
        theirPublicKey: null,
        theirIdentityKey: null,
        theirSignedPublicKey: null,
        handshakeStage: 0,
        open: false
      }
      //set metadata to our keys, and sign them 
      options.metadata.A.publicKey = sodium.to_base64(this.connections[peerId].ourKeyPair.publicKey);
      options.metadata.A.identityKey = sodium.to_base64(USERDATA.IDENTITY_KEY.publicKey);
      options.metadata.A.signedPublicKey = sodium.to_base64(cw.signMessage(options.metadata.A.publicKey));
      options.metadata.A.version = {
        string: VERSION.version_string,
        signed: VERSION.signed_version_string
      }

      //connect
      dataConnection = this.peer.connect(peerId, options);
      this.connections[peerId].connection = dataConnection;
      dataConnection.on('error', (err) => {
        console.log('error in data connection:',err);
      })
      this.connections[peerId].role = {
        us: "A",
        them: "B"
      }


      //init handshake
    }
    dataConnection.on('open', () => {
      console.log("Connection Opened");
      this.connections[peerId].open = true;

      if (!isInitiator && this.connections[peerId].handshakeStage == 1) {
        dataConnection.send(firstHandshakeAckRequest);
      }

    });
    dataConnection.on('data', (data) => {
      this.handleIncomingData(peerId, data);
    });
    dataConnection.on('close', () => {
      this.connections[peerId].open = false;
      console.log("closing")
    });
  }

  handleHandshake(peerId, req) {
    const data = req.data;
    const connection = this.connections[peerId];
    if (connection.handshakeStage == 0) {

      if (req.status.code != 200) {
        console.log("Handshake failed, code: ", data.status)
        return;
      }
      //we are the initiators 
      connection.handshakeStage = 1;


      const isNewUser = !USERDATA.known_users[peerId];

      connection.theirPublicKey = sodium.from_base64(data.B.publicKey);
      connection.theirIdentityKey = sodium.from_base64(data.B.identityKey);
      connection.theirSignedPublicKey = sodium.from_base64(data.B.signedPublicKey);

      let [ID, signedID] = connection.connection.peer.slice(1,-1).split(' '); //get all but the first and last characters of the id
      signedID = sodium.from_base64(signedID);

      const isIdentityKeyValid = cw.verifySignature(signedID, ID, this.connections[peerId].theirIdentityKey) &&
        cw.verifySignature(this.connections[peerId].theirSignedPublicKey, sodium.to_base64(this.connections[peerId].theirPublicKey), this.connections[peerId].theirIdentityKey) &&
        (isNewUser || isEqualArray(USERDATA.known_users[peerId].identityKey, this.connections[peerId].theirIdentityKey));

      if (isIdentityKeyValid) {
        connection.connection.metadata.B = {...data.B};
      }

      let dataToSend = {null: null};

      

      if (isNewUser) {
        USERDATA.known_users[peerId] = {
          identityKey: this.connections[peerId].theirIdentityKey,
          isTrusted: false,
          notes: "",
          displayName: peerId.substr(0, 20),
          nickname: peerId.substr(0, 20),
          id: peerId,
          signedId: cw.signMessage(peerId+"signed_id"),
          channels: []
        }
      }
      //make special channel
      this.newChannel(peerId);
      saveUserData();

      connection.handshakeStage = 2;

      let status = {
        code: 200,
        message: "handshake complete"
      }
      if (!isIdentityKeyValid) {
        status = {
          code: 403,
          message: "identity key is not valid"
        }
      }
      connection.connection.send({
        type: "handshake",
        status,
        data: dataToSend
      })
      connection.handshakeStage = 3;
    } else if (connection.handshakeStage == 1) {

      if (req.status.code != 200) {
        console.log("Handshake failed, code: ", req.status)
        return;
      }
      connection.handshakeStage = 2;
      connection.connection.send({
        type: "handshake",
        status: {
          code: 200,
          message: "handshake complete"
        },
        data: { null: null }
      });
      connection.handshakeStage = 3
      console.log("handshake complete")
      this.onConnectionOpen(peerId);
    } else if (connection.handshakeStage == 2) {

      if (req.status.code != 200) {
        console.log("Handshake failed, code: ", req.status)
        return;
      }
      console.log("handshake fully complete")
      this.onConnectionOpen(peerId);
    } else {
      console.log("weird handshake message:",req)
    } 
  }

  onConnectionOpen(peerId) {
    const connection = this.connections[peerId];
    const theirVersion = connection.connection.metadata[connection.role.them].version.string.split('.');
    const ourVersion = VERSION.version_string.split('.');
    const needsUpdate = theirVersion[0] > ourVersion[0];
    if (needsUpdate) {
      //request update
      console.log("needs update")
      const dataToSend = {
      }
      this.sendMessage(new Message(this.getMutualChannel(peerId),{}, "update-request"));
    }

    const msg = new Message(this.getMutualChannel(peerId), {})
  }

  getMutualChannel(peerId) {
    return StringXOR(peerId, USERDATA.PEER_ID);
  }

  handleIncomingData(peerId, data) {
    console.log('Incoming data:', data);
    const connection = this.connections[peerId];

    if (data.type === 'handshake' && connection.handshakeStage <= 2) {
      this.handleHandshake(peerId, data); 
    } else if (connection.handshakeStage > 2) {

      if (!data.encrypted) {
        console.log("no encrypted data")
        return;
      }

      if (!data.nonce) {
        console.log("no nonce")
        return;
      }
      this.middleware(peerId, data);

/*
      data.encrypted = sodium.from_base64(data.encrypted);
      data.nonce = sodium.from_base64(data.nonce);
      data.publicKey = sodium.from_base64(data.publicKey);
      const decryptedMessage = this.cw.decryptMessage(data.encrypted, data.nonce, this.connections[peerId].theirPublicKey, this.connections[peerId].ourKeyPair.privateKey);
      console.log('Received message:', decryptedMessage);
*/
    }
  }

  saveSentMessage(msgObj) {
    let newKeyPair = sodium.crypto_box_keypair();
    let {encrypted, nonce} = this.cw.encryptMessage(JSON.stringify(msgObj.data), newKeyPair.publicKey, newKeyPair.privateKey);
    USERDATA.channels[msgObj.channelId].messages[USERDATA.PEER_ID] ??= [];
    USERDATA.channels[msgObj.channelId].messages[USERDATA.PEER_ID].push({
      privateKey: newKeyPair.privateKey,
      message: encrypted,
      nonce: nonce,
      timestamp: Date.now(),

    })
    saveUserData();
  }

  saveReceivedMessage(peerId, data) {
    if (!USERDATA.channels[data.channel.id]) {
      newChannel(data.channel.name, Object.keys(data.channel.peers), data.channel.id);
    }
    USERDATA.channels[data.channel.id].messages[peerId] ??= [];
    console.log(this.connections[peerId])
    console.log(peerId)
    console.log(this.connections)

    USERDATA.channels[data.channel.id].messages[peerId].push({
      //publicKey: this.connections[peerId].theirPublicKey,
      privateKey: this.connections[peerId].ourKeyPair.privateKey,
      message: data.encrypted,
      nonce: data.nonce,
      timestamp: Date.now()
    })
    saveUserData();
  }

  runHandler(type, peerId, req) {
    if (req.returnCallback && this.connections[peerId].callbacks[req.returnCallback]) {
      this.connections[peerId].callbacks[req.returnCallback](req);
      delete this.connections[peerId].callbacks[req.returnCallback];
    }
    else if (this.defaultHandlers[type]) {
      this.defaultHandlers[type](peerId, req);
    } else {
      console.log("no handler for",type)

    }
  }

  middleware (peerId, data) {
    const decryptedData = JSON.parse(cw.decryptMessage(sodium.from_base64(data.encrypted), sodium.from_base64(data.nonce), this.connections[peerId].theirPublicKey, this.connections[peerId].ourKeyPair.privateKey));
    console.log("received data",decryptedData,"from",peerId);
    data.data = decryptedData;
    this.saveReceivedMessage(peerId, data);

    this.runHandler(data.type, peerId, data);
  }
  //cw.encryptMessage(message, sharedSecret, publicKey)
  //cw.decryptMessage(encrypted, nonce, publicKey, privateKey)

  newChannel(name, peersToInclude, id) {
    const isDM = (typeof peersToInclude == 'undefined' && typeof name == 'string');
    name ??= peersToInclude.join(", ");
    if (typeof peersToInclude == 'string') {
      peersToInclude = [peersToInclude];
    }
    if (isDM) {
      peersToInclude = [name];
      //ensure it is the same on both sides
      id = StringXOR(name,USERDATA.PEER_ID);
    }
    const peers = {};
    const newChannelId = isDM ? id : id ?? sodium.to_base64(sodium.randombytes_buf(64));

    //if it's a DM (special channel) create it
    if (isDM) {
      const creationDate = {
        timestamp: Date.now()+""
      }
      creationDate.signed = cw.signMessage(creationDate.timestamp);
      USERDATA.channels[newChannelId] = {
        name,
        description: "DM w/ " + name,
        peers: {
        },
        messages: {},
        creationDate,
        id: newChannelId
      }
      USERDATA.channels[newChannelId].peers[name] = {
        id,
        name,
        signedId: cw.signMessage(id+"signed_id"),
      }
      saveUserData();
      return newChannelId;
    }

    //if it's not a DM, create it and send invites
    peersToInclude.forEach(peerId => {


      USERDATA.known_users[peerId].channels ??= [];
      console.log(USERDATA.known_users[peerId], newChannelId);
      USERDATA.known_users[peerId].channels.push(newChannelId);
      peers[peerId] = {
        id: peerId,
        name: USERDATA.known_users[peerId].displayName,
        signedId: USERDATA.known_users[peerId].signedId,
        roles: ["member"],
      }

    })
    let creationDate = {
      timestamp: Date.now()+"",
    }
    console.log(creationDate.timestamp)
    creationDate.signed = cw.signMessage(creationDate.timestamp);
    USERDATA.channels[newChannelId] = {
      name,
      description: "",
      peers: peersToInclude,
      messages: {},
      creationDate,
      id: newChannelId
    }
    saveUserData();
    return newChannelId;

  }

  sendMessage(msgObj) {
    if (!msgObj instanceof Message) {
      //sending raw data, convert to message
      return; //bad message
    }
    msgObj.getPackets().forEach(([peerId, packet]) => {
      const connection = this.connections[peerId];
      if (connection.handshakeStage <= 2) {
        console.log("handshake incomplete")
        return; //skip - handshake not complete
      }
      connection.connection.send(packet); 
    })


    this.saveSentMessage(msgObj);

  }

  sendMessage_old(peerId, message) {
    if (typeof message !== 'object') {
      message = { data: message };
    }
    message = JSON.stringify(message);
    const connection = this.connections[peerId];
    if (connection && connection.isHandshakeComplete) {
      const encryptedMessage = this.cw.encryptMessage(message, connection.ephemeralKeyPair.publicKey, this.identityKeyPair.privateKey);
      const messagePacket = {
        type: 'message',
        encrypted: sodium.to_base64(encryptedMessage.encrypted),
        nonce: sodium.to_base64(encryptedMessage.nonce),
        publicKey: sodium.to_base64(this.identityKeyPair.publicKey)
      };
      connection.connection.send(messagePacket);
    } else {
      console.log('Handshake not complete or connection does not exist for peer:', peerId);
    }
  }
}

class Message {
  constructor(channel, data, type = 'message', status = {code: 200, message: "OK"}, returnCallback = false, callback = (data) => {console.log("received callback", data)}, wrappedPeerObj = userPeer) {
    this.channel = USERDATA.channels[channel];
    this.channelId = channel;
    this.data = data;
    if (typeof this.data != "object") this.data = {data: this.data};
    this.status = status;
    this.callback = callback;
    this.callbackId = sodium.to_base64(sodium.randombytes_buf(64));
    this.type = type;
    this.wrappedPeerObj = wrappedPeerObj;
    this.returnCallback = returnCallback;
  }
  getPackets() {
    const packets = [];
    Object.keys(this.channel.peers).forEach(peerId => {
      const connection = this.wrappedPeerObj.connections[peerId];
      if (!connection.open) return;
      const callbackId = sodium.to_base64(sodium.randombytes_buf(64));
      connection.callbacks ??= {};
      connection.callbacks[callbackId] = this.callback;
      const {encrypted, nonce} = cw.encryptMessage(JSON.stringify(this.data), connection.theirPublicKey, connection.ourKeyPair.privateKey);
      packets.push([peerId, {
        type: this.type,
        encrypted: sodium.to_base64(encrypted),
        nonce: sodium.to_base64(nonce),
        signatures: {
          encrypted: sodium.to_base64(cw.signMessage(encrypted)),
          nonce: sodium.to_base64(cw.signMessage(nonce))
        },
        isEncrypted: true,
        callbackId: this.callbackId,
        returnCallback: this.returnCallback,
        status: this.status,
        channel: {
          id: this.channelId,
          creationDate: this.channel.creationDate,
          name: this.channel.name,
          description: this.channel.description,
          peers: this.channel.peers
        }
      }])
    });
    return packets;
  }

}
