//makes a version system, that fullfils the following requirements:
/*
1. JSON Object containing the following:
2. Version number, Semver compatible
3. Version number, signed by MASTER_KEY (defined elsewhere)
4. Changelog
 - JSON object containing:
  - bugfix changes (array of ChangeLogEntry objects)
  - feature changes (array of ChangeLogEntry objects)
  - breaking changes (array of ChangeLogEntry objects)
   - each breaking change has migration code
    - contains the version added
    - contains the keys to modify from the userData.txt
    - contains a function that modifies the userData.txt
    - sets the specified key of the userData.txt to the output of the function
5. JSON serializeable
6. JSON deserializeable

*/

//defining the ChangeLogEntry class

//defining the Version class
class Version {
  constructor ({
      version_string,
      major_version,
      minor_version,
      signed_version_string,
      code_hash,
      changelog
    }, blank = false) {
    if (blank) return;
    this.version_string = version_string;
    this.major_version = major_version;
    this.minor_version = minor_version;
    this.signed_version_string = signed_version_string;
    this.code_hash = code_hash;
    this.changelog = changelog;
  }
  setSemverVersion(version, signed_version_string) {
    this.version_string = version;
    [this.major_version, this.minor_version] = version.split(".");
    this.signed_version_string = signed_version_string;
    if (USERDATA.MASTER_KEY == USERDATA.IDENTITY_KEY.publicKey) // user is the admin (me lol)
    this.signed_version_string = cw.signMessage(version);
  }
  setChangelog(changelog) {
    this.changelog = changelog;
  }
  addChangelogItem(version, changelogItem) {
    this.changelog[version] = changelogItem;
  }
  verifyVersion() {
    return cw.verifySignature(this.signed_version_string, this.version_string, USERDATA.MASTER_KEY)
  }
  toJSON() {
    return {
      __type: "Version",
      version_string: this.version_string,
      major_version: this.major_version,
      minor_version: this.minor_version,
      signed_version_string: this.signed_version_string,
      code_hash: this.code_hash,
      changelog: this.changelog
    }
  }
}


