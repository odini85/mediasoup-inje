import { roomManager } from "./module/classes";

export function registerRouter(expressApp) {
  // lobby
  expressApp.get("/lobby", (_, res) => res.render("lobby"));

  // room 생성
  expressApp.get("/room/create", async (req, res) => {
    console.log(">>> /room/join/:roomId", req.params.roomId);
    const room = roomManager.createRoom();

    res.send({
      roomId: room.roomId,
    });
  });

  // room 참여
  expressApp.get("/room/join/:roomId", async (req, res) => {
    const { roomId } = req.params;
    console.log(">>> /room/join/:roomId", roomId);
    // res.send({ value: req.params.roomId });

    res.render("room/join", req.params);
  });

  // lobby
  expressApp.get("/create-cookie", (_, res) => {
    res.cookie(
      "COOKIE_NAME",
      {
        seq: 0,
        name: "odin",
        gender: "Male",
        age: 30,
      },
      {
        maxAge: 1000 * 60 * 3,
        httpOnly: true,
      }
    );
    res.send("쿠키 생성완료!!");
  });
}
