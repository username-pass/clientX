# The new Peer to Peer messaging framework

This is a template to build your own custom P2P application, with automatic encryption, reconnection, userdata saving, and more

# Features:

 - Integrity checking
   - Automatically checks the integrity of the file before load. If it is modified, it will alert the user, and prevent further use
 - Automatic encryption
   - all communications between peers is automatically encrypted with a temporary session keypair
 - Auto login
   - This uses a login system that uses the user file as the user account. It automatically deals with the storage of the file handler, creation of new files, and importing of old files
 - Version detection
   - This automatically detects when the version is out of date. Auto-updating is coming soon
 - Potential to send data to multiple users at once
   - If you want a group chat system, this has the potential to do that, using a "channel" system
  

# How to use:

## For developers:

### To begin coding:

 - generate your keypair using libsodium (you can open a browser and do that)
 - turn it into a string by applying the reverse of the functions in `build.js`
 - add them to a file named `master_keys.json`

### To create a release

 - specify the version number using the given variables
 - make it SemVer compliant for best results
 - run `build.js`
 - grab the newly generated files

### To make your application

 - go to index.html
 - download any dependencies, and import them using a src tag
 - CSS has to be added inside the file, currently there is no support for external CSS
   - (Going to be fixed soon)
 - write your code
 - set `window.onPeerLoad()` to your init function

### To use peers

 - create a new `WrappedPeer()`
 - to add a connection, run `peer.addConnection(<other peer Id>)`
 - peer Id is available at `peer.id`

### To send data using a peer

 - create a new `Message(channel, data, type?, status?, returncallbackId?, callback?, wrappedPeerObj?)`
 - arguments:
   - channel: the channel to use to send the message. When in doubt, use the default one created. (You can find its ID at `Object.keys(USERDATA.channels)`) - required
   - data: the data to be sent, in a JSON object - required
   - type: the type of message, useful for adding handlers to specific types - defaults to 'message'
   - status: a JSON object in the format `{code:<status code like 200>, message:<human readable message}` - defaults to `{code:200, message:"all good"}`
   - returnCallbackId: the id to return your callback to. Used when returning data to the other peer's callback - defaults to null
   - callback: the callback function to run when a message with a matching returnCallbackId is received - defaults to `(data) => {console.log("received data", data)}`
   - wrappedPeerObj: for advanced users only. The WrappedPeer to use as the peer object, useful for when you have multiple (though that's generally unecessary) - defaults to `userPeer`
 - run `userPeer.sendMessage(<message object>)` (userPeer is just the default name for the WrappedPeer object

## For users:

 - Just download the html file from the developer, and open it in your browser!

 - coming soon. For now, you can use the functions in the command line, after opening up any of the HTML files
