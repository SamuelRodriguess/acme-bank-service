const express = require("express");
const router = express.Router();
const { downloadValidation, getDownloadPage, postDownload } = require("../controllers/downloadController");

router.get("/download", getDownloadPage);
router.post("/download", downloadValidation, postDownload);

module.exports = router;
