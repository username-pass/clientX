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
  signMessage(message, privateKey = USERDATA.IDENTITY_KEY.privateKey) {
    return this._s.crypto_sign_detached(message, privateKey);
  }

  // Verify signature using sender's public key
  verifySignature(signature, message, senderPublicKey) {
    return this._s.crypto_sign_verify_detached(signature, message, senderPublicKey);
  }

}
