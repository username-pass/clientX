const fs = require('fs');
//const dotenv = require('dotenv');
const sodium = require('libsodium-wrappers');
const { JSDOM } = require('jsdom');
const express = require('express');
const path = require('path');
const app = express();


app.get('/dl', (req, res) => {
    // Set the headers to force download
    res.setHeader('Content-Disposition', 'attachment; filename=index.html');
    // Send the index.html file as the response
    res.sendFile(path.join(__dirname, 'index.m.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname,'index.m.html'));
})

app.use(express.static(path.join(__dirname,'.')))
//console.log("app listening on port 3003");
//app.listen(3003);


//import minify function 


async function writeOutputFile(vm = 1)  {
  await sodium.ready;

  //read master key from .env

  const MASTER_KEYS = JSON.parse(fs.readFileSync('master_keys.json', 'utf8'));

  const MASTER_KEY_PRIVATE = Uint8Array.from(Buffer.from(MASTER_KEYS.PRIVATE, 'base64'));
  const MASTER_KEY = Uint8Array.from(Buffer.from(MASTER_KEYS.PUBLIC, 'base64'));
  //write a comment explaining the regex variable
  //a regex that matches for script tags in the html file and returns the filepath of the script file in the match group named 'filepath' 
  const regex = /<!--.*?|<script src="(?<filepath>[^"]+)"><\/script>/g;
  
  
  
  const version_major = vm;
  const version_minor = 0;
  const version_patch = 0;

  const version = [version_major, version_minor, version_patch].join(".");
  const inputFile = 'index.html';
  const outputFile = 'index.V'+version_major+'.html';
  const hashes = {};
  let VERSION = {};

  fs.readFile(inputFile, 'utf8', (err, data) => {
    if (err) {
      console.error(`Error reading file: ${err}`);
      return;
    }


    let modifiedData = data.replace(regex, (match, filepath) => {
      if (!filepath) {
        return match;
      }
      const fileContent = fs.readFileSync(filepath, 'utf8');
      //let sigId = Buffer.from(sodium.randombytes_buf(20)).toString('base64');
      let chunk = `<script originalSrc="${filepath}">${fileContent}</script>`;
      //add chunk signature to signChunks
      return chunk;
    });


    const { document } = new JSDOM(modifiedData).window;

    const newEl = document.createElement('div');
    newEl.innerHTML = version;
    document.body.appendChild(newEl);

    const elementsToSign = Array.from(document.querySelectorAll('body > *, head > *'));
    elementsToSign.push(document.querySelector('body'));
    elementsToSign.push(document.querySelector('head'));

    elementsToSign.forEach(element => {
      //hash the innerHTML
      const hash = sodium.to_base64(sodium.crypto_generichash(32, sodium.from_string(element.innerHTML)));

      //sign the hash 
      const signature = sodium.crypto_sign_detached(hash, MASTER_KEY_PRIVATE, 'base64');
      hashes[hash] = signature;

      element.setAttribute('cryptoSignaturehash', hash);
      element.setAttribute('cryptosignature', signature);
      //log type of element (div, head, span, button, etc)
      console.log(element.localName);

    })

    console.log(hashes)

    
    VERSION = {
      version_string: version,
      signed_version_string: sodium.to_base64(sodium.crypto_sign_detached(version, MASTER_KEY_PRIVATE)),
      code_hash: {
        parts: hashes
      }
    }
    VERSION = JSON.stringify(VERSION);
    VERSION = Buffer.from(VERSION).toString('base64');

    document.head.setAttribute('MASTER_KEY',sodium.to_base64(MASTER_KEY));
    document.head.setAttribute('VERSION', VERSION);


    modifiedData = document.documentElement.outerHTML;
    fs.writeFile(outputFile, modifiedData, 'utf8', (err) => {
      if (err) {
        console.error(`Error writing to file: ${err}`);
        return;
      }
      console.log(`New file ${outputFile} written successfully!`);
    });
  });

};

writeOutputFile(1);
writeOutputFile(2);
