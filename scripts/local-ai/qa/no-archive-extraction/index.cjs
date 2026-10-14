// No archive input is opened, read or extracted. Existing Chrome is mandatory.
module.exports = async function disabledArchiveExtraction() {
  throw new Error('ShowNight-QA: Archivextraktion ist deaktiviert. Vorhandenes Chrome verwenden.');
};
