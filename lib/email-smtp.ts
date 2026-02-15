import tls from "tls";

function getSmtpConfig() {
  return {
    host: process.env.AUTH_EMAIL_SMTP_HOST || "",
    port: Number(process.env.AUTH_EMAIL_SMTP_PORT || 465),
    user: process.env.AUTH_EMAIL_SMTP_USER || "",
    pass: process.env.AUTH_EMAIL_SMTP_PASS || "",
    from: process.env.AUTH_EMAIL_FROM || process.env.AUTH_EMAIL_SMTP_USER || "",
  };
}

function toBase64(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64");
}

function formatMail({
  from,
  to,
  subject,
  text,
}: {
  from: string;
  to: string;
  subject: string;
  text: string;
}) {
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
  ].join("\r\n");
}

export async function sendEmailBySmtp({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ success: boolean; error?: string }> {
  const config = getSmtpConfig();

  if (!config.host || !config.user || !config.pass || !config.from) {
    return { success: false, error: "SMTP config missing" };
  }

  return await new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: config.host,
        port: config.port,
        servername: config.host,
      },
      () => {
        // connected
      }
    );

    let closed = false;
    let buffer = "";
    let step = 0;

    const finish = (result: { success: boolean; error?: string }) => {
      if (closed) return;
      closed = true;
      try {
        socket.end();
      } catch {
        // ignore
      }
      resolve(result);
    };

    const send = (command: string) => {
      socket.write(command + "\r\n");
    };

    const handleLine = (line: string) => {
      const code = Number(line.slice(0, 3));
      if (!Number.isFinite(code)) return;

      if (line[3] === "-") return;

      if (code >= 400) {
        finish({ success: false, error: `SMTP error ${line}` });
        return;
      }

      switch (step) {
        case 0:
          send(`EHLO ${config.host}`);
          step = 1;
          break;
        case 1:
          send("AUTH LOGIN");
          step = 2;
          break;
        case 2:
          send(toBase64(config.user));
          step = 3;
          break;
        case 3:
          send(toBase64(config.pass));
          step = 4;
          break;
        case 4:
          send(`MAIL FROM:<${config.from}>`);
          step = 5;
          break;
        case 5:
          send(`RCPT TO:<${to}>`);
          step = 6;
          break;
        case 6:
          send("DATA");
          step = 7;
          break;
        case 7: {
          const body = formatMail({
            from: config.from,
            to,
            subject,
            text,
          });
          socket.write(body + "\r\n.\r\n");
          step = 8;
          break;
        }
        case 8:
          send("QUIT");
          step = 9;
          break;
        case 9:
          finish({ success: true });
          break;
        default:
          break;
      }
    };

    socket.setTimeout(15000);

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf-8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        handleLine(line);
      }
    });

    socket.on("timeout", () => {
      finish({ success: false, error: "SMTP timeout" });
    });

    socket.on("error", (error) => {
      finish({ success: false, error: error.message || "SMTP connection failed" });
    });

    socket.on("end", () => {
      if (!closed && step < 9) {
        finish({ success: false, error: "SMTP connection closed unexpectedly" });
      }
    });
  });
}

