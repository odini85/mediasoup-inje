import express from "express";
import https from "https";
import cookieParser from "cookie-parser";
import { createCertificate } from "./utils";
import config from "./config";

const expressApp = express();
if (!process.env.PWD) {
  process.env.PWD = process.cwd();
}

expressApp.use(express.json({ type: "*/*" }));
expressApp.use("/public", express.static(process.env.PWD + "/src/public"));
expressApp.use(cookieParser());

expressApp.set("view engine", "ejs");
expressApp.set("views", process.env.PWD + "/src/server/views");

// const pem = createCertificate([{ name: "commonName", value: "localhost" }]);

// const httpsServer = https.createServer(
//   {
//     cert: Buffer.from(pem.cert),
//     key: Buffer.from(pem.private),
//   },
//   expressApp
// );

// httpsServer.listen(config.httpPort, config.httpIp, () => {
//   console.log(
//     `server is running and listening on ` +
//       `https://${config.httpIp}:${config.httpPort}`
//   );
// });

expressApp.listen(config.httpPort, config.httpIp, () => {
  console.log(
    `server is running and listening on ` +
      `http://${config.httpIp}:${config.httpPort}`
  );
});

export default expressApp;
