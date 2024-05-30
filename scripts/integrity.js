const firstDoc = document.documentElement.outerHTML;
let loadState = {
  loaded: false,
  sodiumLoaded: false,
  checkedIntegrity: false
}


//Run Check integrity once the document is loaded, and sodium is loaded, whichever comes last
document.addEventListener("DOMContentLoaded", () => {
  loadState.loaded = true;
  if (loadState.sodiumLoaded) {
    checkIntegrity(false,init);
  }
});

window.sodium = {
  onload: (_sodium) => {
    sodium = _sodium;
    loadState.sodiumLoaded = true;
    if (loadState.loaded) {
      checkIntegrity(false,init);
    }
  }
};
async function checkIntegrity(strict=true, callback) {
const secondDoc = document.documentElement.outerHTML;

  cw = new CryptoWrapper(); 
  //create a crypto wrapper, to bring in a bunch of helper functions
  cw = new CryptoWrapper(sodium);
  MASTER_KEY = sodium.from_base64(document.head.getAttribute('MASTER_KEY'));
  VERSION = JSON.parse(Buffer.from(document.head.getAttribute("VERSION"), 'base64'));

  console.log(firstDoc == secondDoc);

  let elementsToCheck = document.querySelectorAll('body, head, body > *, head > *');
  //elementsToCheck.push(document.body);
  //elementsToCheck.push(document.head);
  let hashes = {};
  integrityLevel = 0;
  const elementsToDelete = [];
  console.log(elementsToCheck)
  elementsToCheck.forEach(async (element) => {
    //hash the innerHTML
    const hash = sodium.to_base64(sodium.crypto_generichash(32, sodium.from_string(element.innerHTML)));

    //sign the hash 
    let signature = (VERSION.code_hash.parts[hash]) ? sodium.from_base64(VERSION.code_hash.parts[hash]) : undefined;

    const signatureCorrect =  //check if signature or hash are even defined 
      signature !== undefined &&
      hash !== undefined &&
      cw.verifySignature(signature, hash, MASTER_KEY);// && // check if the signature is correct 
      isEqualArray(hash, element.getAttribute('cryptoSignaturehash')) && // check if the element itself has its correct hash 
      isEqualArray(signature, element.getAttribute('cryptosignature'))// && // check if the element itself has its correct signature
      element.hasAttribute('cryptosignaturehash') &&
      element.hasAttribute('cryptosignature'); // check if the element itself hash its correct signature 

    //rewrite of the signatureCorrect, but this time using isEqalsArrays to check if the signatures and hashes match 
    

    hashes[hash] = signatureCorrect;
    console.log(signatureCorrect);
    
//currently, integrity is compromised because cloudflare injects a script to the body element, which causes more issues

    integrityLevel += (1);
    if (signature === undefined || !signatureCorrect) {
      console.log(hash,signature,signatureCorrect)
      console.log(VERSION.code_hash.parts[hash])
      console.log("element:",element)
      console.log(signature)
      //something went wrong
      integrityLevel -= (1/elementsToCheck.length);
      elementsToDelete.push(element);
      if (strict) {
        document.documentElement.remove(); // remove document, alert that issue has been found
        alert("Important!\nIntegrity has been compromised! Please download a new version or copy of the file. ")
        throw new Error("File has invalid hashes, integrity has been compromised");

      }
    }
  });
  integrityLevel /= elementsToCheck.length;

  if (integrityLevel < 1 || elementsToDelete.length > 0) {
    //integrity is compromised
    alert("Important!\nIntegrity has been compromised! ("+integrityLevel*100+"% integrity, "+elementsToDelete.length+" bad elements). \nPlease download a new version or copy immediately.");
    //delete all offending elements
    alert(JSON.parse(elementsToDelete));
    console.log(elementsToDelete);
    elementsToDelete.concat(document.querySelectorAll('head *:not([cryptosignaturehash]):not([cryptosignature]), body *:not([cryptosignaturehash]):not([cryptosignature])'));
    elementsToDelete.forEach(element => {
      console.log(element)
      //if (confirm("delete element?"))
        element.parentNode.removeChild(element);
    });
  }
  console.log(hashes);
  console.log(VERSION.code_hash.parts);

  //console.log = _console.log();
  try {
    // eruda.init();
  } catch (err) {
    console.log(err.toString())
  }
  loadEruda();
  callback();

}
