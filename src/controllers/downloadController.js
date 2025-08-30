const path = require("path");
const fs = require("fs");
const { body, validationResult } = require("express-validator");

const downloadValidation = [
  body("file")
    .exists()
    .withMessage("No file specified")
    .bail()
    .matches(/^[a-zA-Z0-9_\-\.]+$/)
    .withMessage("Invalid file name"),
];

const getDownloadPage = (req, res) => {
  if (!req.session.loggedin) {
    return res.redirect("/");
  }
  res.render("download", { file_name: req.session.file_history });
};

const postDownload = (req, res) => {
  if (!req.session.loggedin) {
    return res.redirect("/");
  }
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const file_name = req.body.file;
  const safeFileName = path.basename(file_name);
  const filePath = path.join(__dirname, "../../history_files", safeFileName);

  if (!filePath.startsWith(path.join(__dirname, "../../history_files"))) {
    return res.status(400).send("Invalid access");
  }
  fs.readFile(filePath, "utf8", (err, content) => {
    if (err) {
      return res.status(404).send("File not found");
    }
    res.type("text/plain").send(content);
  });
};

module.exports = {
  downloadValidation,
  getDownloadPage,
  postDownload,
};
