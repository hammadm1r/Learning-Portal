const express = require("express");
const router = express.Router();
const oracledb = require("oracledb");

// Oracle DB config
const dbConfig = {
  user: "PORTAL_ADMIN",
  password: "portal123",
  connectString: "127.0.0.1:1521/XE",
};

router.get("/", (req, res) => {
  res.render("index");
});

router.post("/login", async (req, res) => {
  const { username, password, role } = req.body;
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);

    // Step 1: Get user by username & role
    const result = await connection.execute(
      `SELECT * FROM users WHERE USERNAME = :username AND ROLE = :role`,
      { username, role },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const user = result.rows[0];

    // Step 2: Check if user exists
    if (!user) {
      return res.render("index", { error: "User not found." });
    }

    // Step 3: Check lock status
    if (user.ACCOUNT_LOCKED === "Y") {
      return res.render("index", {
        error: "Account is locked. Contact administrator."
      });
    }

    // Step 4: Password match?
    if (user.PASSWORD_HASH !== password) {
      // ❌ Wrong password – increase attempts
      await connection.execute(
        `UPDATE users SET failed_attempts = failed_attempts + 1 WHERE username = :username`,
        { username }
      );
      await connection.commit(); // ✅ commit increment

      // Step 5: Fetch updated attempt count
      const attemptCheck = await connection.execute(
        `SELECT failed_attempts FROM users WHERE username = :username`,
        { username },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const attempts = attemptCheck.rows[0].FAILED_ATTEMPTS;

      // Step 6: Lock if 3 or more
      if (attempts >= 3) {
        await connection.execute(
          `UPDATE users SET account_locked = 'Y' WHERE username = :username`,
          { username }
        );
        await connection.commit(); // ✅ commit lock
        return res.render("index", {
          error: "Account locked after 3 failed attempts."
        });
      }

      return res.render("index", {
        error: `Invalid password. Attempt ${attempts}/3.`
      });
    }

    // ✅ Password correct – reset attempts
    await connection.execute(
      `UPDATE users SET failed_attempts = 0 WHERE username = :username`,
      { username }
    );
    await connection.commit(); // ✅ commit reset

    // ✅ Save session & redirect
    req.session.username = username;
    req.session.role = role;
    res.redirect("/dashboard");

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("Login failed due to a server error.");
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error("Error closing connection:", err);
      }
    }
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

router.get("/dashboard", async (req, res) => {
  if (!req.session.username) return res.redirect("/");

  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);

    const result = await connection.execute(
      `SELECT GET_GREETING(:username) AS GREETING FROM dual`,
      { username: req.session.username },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const expiryResult = await connection.execute(
      `SELECT EXPIRY_DATE FROM DBA_USERS WHERE USERNAME = UPPER(:username)`,
      { username: req.session.username },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const expiryDate = expiryResult.rows[0]?.EXPIRY_DATE;
    const expiryDays = expiryDate
      ? Math.ceil(
          (expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        )
      : undefined;

    const greeting = result.rows[0]?.GREETING || "Welcome!";

    res.render("dashboard", {
      username: req.session.username,
      role: req.session.role,
      greeting,
      expiryDays, // <== Add this here!
      menus:
        req.session.role === "student"
          ? ["My Courses", "CGPA", "Fee Status"]
          : ["My Courses", "Attendance Sheet", "Grade Submission"],
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).send("Error loading dashboard.");
  } finally {
    if (connection) await connection.close();
  }
});

module.exports = router;
