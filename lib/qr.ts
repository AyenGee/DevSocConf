import QRCode from "qrcode";

/**
 * Generates a QR code PNG (as a base64 data buffer, suitable for an email
 * attachment) encoding ONLY the opaque ticket_id — never name, email, or
 * student number. The database is what determines validity at scan time,
 * not the QR payload itself.
 */
export async function generateTicketQrPngBuffer(ticketId: string): Promise<Buffer> {
  return QRCode.toBuffer(ticketId, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 480,
    color: {
      dark: "#0A1F44", // navy modules
      light: "#FFFFFF",
    },
  });
}
