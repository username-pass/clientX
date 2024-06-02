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
  }

  addPeerListeners() {
    this.peer.on('open', () => {
      this.isPeerOpen = true;
    });
    this.peer.on('disconnected', () => {
      this.isPeerOpen = false;
    });
    this.peer.on('connection', (dataConnection) => {
      this.addConnection(dataConnection.peer, {}, dataConnection);
    });
    this.peer.on('error', (err) => {
      console.log('error:', err);
    });
    this.peer.on('close', () => {
      this.isPeerOpen = false;
    });
  }

  addConnection(peerId, options, dataConnection) {
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

      const isNewUser = !USERDATA.known_users[peerId];
      if (isNewUser) {
        USERDATA.known_users[peerId] = {
          identityKey: this.connections[peerId].theirIdentityKey,
          isTrusted: false,
          notes: "",
          displayName: peerId.substr(0, 20),
          nickname: peerId.substr(0, 20),
          id: peerId,
          signedId: cw.signMessage(peerId+"signed_id")
        }
      }
      saveUserData();

      //verify their data 
      //cw.verifySignature(signedData, data, publicKey)
      let [ID, signedID] = dataConnection.peer.slice(1,-1).split(' '); //get all but the first and last characters of the id
      signedID = sodium.from_base64(signedID);
      const isIdentityKeyValid = cw.verifySignature(signedID, ID, this.connections[peerId].theirIdentityKey) &&
        cw.verifySignature(this.connections[peerId].theirSignedPublicKey, sodium.to_base64(this.connections[peerId].theirPublicKey), this.connections[peerId].theirIdentityKey) &&
        (isNewUser || isEqualArray(USERDATA.known_users[peerId].identityKey, this.connections[peerId].theirIdentityKey));
      console.log(isIdentityKeyValid);
      if (!isIdentityKeyValid) return; //TODO: better invalid key handling
      this.connections[peerId].handshakeStage = 1;
      firstHandshakeAckRequest = {
        type: "handshake",
        status: {
          code: 200,
          message: "your identity key is valid"
        },
        data: {
          B: dataConnection.metadata.B
        }
      };
      console.log("handshake part 1, finished")
      if (this.connections[peerId].open) {
        console.log("sending through A");
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

      //connect
      dataConnection = this.peer.connect(peerId, options);
      this.connections[peerId].connection = dataConnection;



      //init handshake
    }
    dataConnection.on('open', () => {
      console.log("Connection Opened");
      this.connections[peerId].open = true;
      console.log(isInitiator, this.connections[peerId])

      if (!isInitiator && this.connections[peerId].handshakeStage == 1) {
        console.log("sending through B");
        dataConnection.send(firstHandshakeAckRequest);
      }

    });
    dataConnection.on('data', (data) => {
      console.log(data)
      this.handleIncomingData(peerId, data);
    });
    dataConnection.on('close', () => {
      this.connections[peerId].open = false;
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

      console.log(data)

      const isNewUser = !USERDATA.known_users[peerId];

      connection.theirPublicKey = sodium.from_base64(data.B.publicKey);
      connection.theirIdentityKey = sodium.from_base64(data.B.identityKey);
      connection.theirSignedPublicKey = sodium.from_base64(data.B.signedPublicKey);

      let [ID, signedID] = connection.connection.peer.slice(1,-1).split(' '); //get all but the first and last characters of the id
      signedID = sodium.from_base64(signedID);

      const isIdentityKeyValid = cw.verifySignature(signedID, ID, this.connections[peerId].theirIdentityKey) &&
        cw.verifySignature(this.connections[peerId].theirSignedPublicKey, sodium.to_base64(this.connections[peerId].theirPublicKey), this.connections[peerId].theirIdentityKey) &&
        (isNewUser || isEqualArray(USERDATA.known_users[peerId].identityKey, this.connections[peerId].theirIdentityKey));

      if (isNewUser) {
        USERDATA.known_users[peerId] = {
          identityKey: this.connections[peerId].theirIdentityKey,
          isTrusted: false,
          notes: "",
          displayName: peerId.substr(0, 20),
          nickname: peerId.substr(0, 20),
          id: peerId,
          signedId: cw.signMessage(peerId+"signed_id")
        }
      }
      saveUserData();

      console.log(isIdentityKeyValid)
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
        data: { null: null }
      })
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
      console.log("handshake complete")
    } else if (connection.handshakeStage == 2) {

      if (req.status.code != 200) {
        console.log("Handshake failed, code: ", req.status)
        return;
      }
      console.log("handshake fully complete")
    } else {
      console.log("weird handshake message:",req)
    } 
  }

  handleIncomingData(peerId, data) {
    console.log('Incoming data:', data);
    const connection = this.connections[peerId];

    if (data.type === 'handshake' && connection.handshakeStage <= 2) {
      this.handleHandshake(peerId, data); 
    } else if (connection.handshakeStage > 2) {
      data.encrypted = sodium.from_base64(data.encrypted);
      data.nonce = sodium.from_base64(data.nonce);
      data.publicKey = sodium.from_base64(data.publicKey);
      const decryptedMessage = this.cw.decryptMessage(data.encrypted, data.nonce, data.publicKey, this.identityKeyPair.privateKey);
      console.log('Received message:', decryptedMessage);
    }
  }
  //cw.encryptMessage(message, sharedSecret, publicKey)
  //cw.decryptMessage(encrypted, nonce, publicKey, privateKey)
  sendMessage(peerId, message) {
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
