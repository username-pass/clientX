//userdata, master key (for integrity), version info, filesystem, crypto wrapper

async function init() {
  //init the fileSystem
  fs = new FileHandlerLibrary();

  let codeSnapshot = document.documentElement.outerHTML;
  //login
  await login(fs);

  //import data
  USERDATA = fs.readDataSync();
  if (USERDATA != "") USERDATA = deserialize(USERDATA);
  else USERDATA = newUserData(MASTER_KEY); //new users

  if (!isEqualArray(USERDATA.MASTER_KEY, MASTER_KEY)) {
    alert("MASTER_KEY not matching with USERDATA.MASTER_KEY. Is the userdata file for the correct program?");
    throw new Error("MASTER_KEY not matching with USERDATA.MASTER_KEY. Is the userdata file for the correct program?")
  }

  //this is how to save
  saveUserData();
  userPeer = new WrappedPeer();
  

  



  async function login() {
    return new Promise((resolve, reject) => {
      let wrapper = document.createElement("div");
      wrapper.id = "login-prompt-wrapper";
      document.body.appendChild(wrapper);
      let loginPrompt = document.createElement("div");
      loginPrompt.id = "login-prompt";
      wrapper.appendChild(loginPrompt);
      let loginBtn = document.createElement("button");
      loginBtn.innerText = "login";
      loginBtn.classList.add("login-btn");
      loginPrompt.appendChild(loginBtn);
      loginBtn.setAttribute("login", true);
      loginBtn.addEventListener("click", async () => {
        if (loginBtn.getAttribute("login")) {
          let status = await fs.initFileSystem(confirm("hard init?"), peerjs.util.browser);
          if (!status) {
            return;
          }
          wrapper.remove();
          //console.log(fs.fileContents);
          resolve();
        }
      });
    })
  }

}
