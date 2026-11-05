import crypto from "crypto";

export default function botAuth(req, res, next) {
  const expected = process.env.BOT_API_SECRET;
  const received = req.get("x-bot-secret");

  if (!expected || !received) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized"
    });
  }

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return res.status(401).json({
      success: false,
      message: "Invalid authentication"
    });
  }

  next();
}