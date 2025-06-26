const express = require("express");
const session = require("express-session");
const path = require("path");
const bodyParser = require("body-parser");
const oracledb = require("oracledb");

oracledb.initOracleClient({ libDir: "C:\\xampp\\instantclient_12_2" }); // ✅ your path

const app = express();
const PORT = 3000;

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({ secret: "secret", resave: false, saveUninitialized: true }));

// ROUTES
const loginRoutes = require("./routes/login");
app.use("/", loginRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
