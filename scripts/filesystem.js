class FileHandlerLibrary {
  constructor() {
    this.files = {};
    this.fs = null;
    this.databaseName = "p2DB";
    this.databaseVersion = 1;
    this.objectStoreName = "items";
    this.fileKeyName = "p2dat";
    this.data = "";
    this.defaultFileName = "user.dat";
    this.seperator = String.fromCharCode(7);
    this.isFileSystemInit = false;
  }

  get fileContents() {
    return this.data;
  }

  async openDB() {
    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open(
        this.databaseName,
        this.databaseVersion
      );

      request.onupgradeneeded = (event) =>
        event.target.result.createObjectStore(this.objectStoreName, {
          keyPath: "key",
        });

      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async dbget(key) {
    try {
      const db = await this.openDB();
      const transaction = db.transaction([this.objectStoreName], "readonly");
      const objectStore = transaction.objectStore(this.objectStoreName);
      const request = objectStore.get(key);

      return new Promise((resolve, reject) => {
        request.onsuccess = (event) =>
          resolve(event.target.result?.value || null);
        request.onerror = (event) => reject(event.target.error);
      });
    } catch (error) {
      console.error("Error in get():", error);
      throw error;
    }
  }

  async dbset(key, value) {
    try {
      const db = await this.openDB();
      const transaction = db.transaction([this.objectStoreName], "readwrite");
      const objectStore = transaction.objectStore(this.objectStoreName);
      const request = objectStore.put({
        key,
        value,
      });

      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        request.onerror = (event) => reject(event.target.error);
      });
    } catch (error) {
      console.error("Error in set():", error);
      throw error;
    }
  }

  async initFileSystem(hard = false, browser = "chrome") {
    if (browser == "chrome") {
      //try {
      const fileHandleOrUndefined = await this.dbget(this.fileKeyName);
      if (fileHandleOrUndefined && !hard) {
        //if you have it, return the handler
        this.fs = fileHandleOrUndefined;
        // console.log(this.fs[0]);
        // console.log(this.fs);
        // this.fs = this.fs[0];
        await this.verifyPermission(this.fs, true);
        const fileData = await this.readData(this.fs);
        if (fileData) {
          this.data = fileData;
        }
        return 1;
      }
      if (confirm("create a new save file?")) {
        //create a new one
        const defaultOpts = {
          suggestedName: this.defaultFileName,
        };
        const handle = await window.showSaveFilePicker(defaultOpts); // prompt "Save As"
        this.fs = handle;
        await this.dbset(this.fileKeyName, this.fs);
        return 3;
      } else {
        //pick an old one
        this.fs = await window.showOpenFilePicker();

        this.fs = this.fs[0];
        await this.dbset(this.fileKeyName, this.fs);
        //await this.verifyPermission(this.fs[0], true);
        const fileData = await this.readData(this.fs);

        if (fileData) {
          this.data = fileData;
          return 2;
        }
      }


      return 0;
      /*} catch (error) {
        console.log(error.name, error.message);
        return 0;
      }*/
    }
    else if (browser === "firefox") {
      try {
        const fileHandleOrUndefined = await this.dbget(this.fileKeyName);
        if (fileHandleOrUndefined && !hard) {
          this.fs = fileHandleOrUndefined;
          await this.verifyPermission(this.fs, true);
          const fileData = await this.readData(this.fs);
          if (fileData) {
            this.data = fileData;
          }
          return 1;
        }

        // Check if File System Access API is supported
        if ('showOpenFilePicker' in window) {
          if (confirm("Create a new save file?")) {
            const handle = await window.showSaveFilePicker();
            this.fs = handle;
            await this.dbset(this.fileKeyName, this.fs);
            return 3;
          } else {
            const handle = await window.showOpenFilePicker();
            this.fs = handle[0];
            await this.dbset(this.fileKeyName, this.fs);
            const fileData = await this.readData(this.fs);
            if (fileData) {
              this.data = fileData;
              return 2;
            }
          }
        } else {
          // Fallback behavior for browsers that do not support File System Access API
          console.error("File System Access API is not supported in this browser.");
          return 0;
        }
      } catch (error) {
        console.error("Error in Firefox initFileSystem:", error);
        return 0;
      }
    }else {
      console.error("Unsupported browser:", browser);
      return 0;
    }
  }

  async verifyPermission(fileHandle, readWrite) {
    const options = {
      mode: readWrite ? "readwrite" : undefined,
    };
    const permission = await fileHandle.queryPermission(options);
    if (
      permission === "granted" ||
      (await fileHandle.requestPermission(options)) === "granted"
    )
      return true;
    return false;
  }

  async readData(fileHandle = this.fs) {
    try {
      const file = await fileHandle.getFile();
      this.data = await file.text();
      return this.data;
    } catch (error) {
      console.log("Error reading file handler data:", error);
      return null;
    }
  }

  readDataSync() {
    return this.data;
  }

  parseData() {
    let dataArray = this.data.split(this.seperator);
    return dataArray;
  }

  async writeData(data) {
    const writer = await this.fs.createWritable(); // request writable stream
    await writer.write(new Blob([data])); // write the Blob directly
    writer.close(); // end writing
    this.data = data;
  }

  convertJSON(json) {
    let out = [json.public, json.private, json.others];
    out = out.join(this.seperator);
    return out;
  }
}
