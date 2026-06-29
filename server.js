const express = require("express");
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.send("Business Card Backend Server");
})

app.listen(PORT, () => {
  console.log(`Server running at https://localhost:${PORT}`);
})