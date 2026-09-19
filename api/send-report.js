const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[c]));

function dataUrlAttachment(dataUrl, filename) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    filename,
    content: match[2],
    content_type: match[1],
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Méthode non autorisée" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const reportTo = process.env.REPORT_TO_EMAIL;
  const from = process.env.RESEND_FROM_EMAIL || "Compagnie des Nuisibles <onboarding@resend.dev>";

  if (!apiKey || !reportTo) {
    return res.status(500).json({
      ok: false,
      error: "Configuration e-mail incomplète sur Vercel.",
    });
  }

  try {
    const body = req.body || {};
    const {
      client,
      address,
      type,
      technician,
      techEmail,
      date,
      start,
      end,
      passage,
      payment,
      report,
      secondVisit,
      photosBefore = [],
      photosAfter = [],
      signature,
    } = body;

    if (!client || !date || !technician || !report) {
      return res.status(400).json({ ok: false, error: "Rapport incomplet." });
    }

    const attachments = [];
    photosBefore.slice(0, 3).forEach((src, i) => {
      const a = dataUrlAttachment(src, `avant-${i + 1}.jpg`);
      if (a) attachments.push(a);
    });
    photosAfter.slice(0, 3).forEach((src, i) => {
      const a = dataUrlAttachment(src, `apres-${i + 1}.jpg`);
      if (a) attachments.push(a);
    });
    const sig = dataUrlAttachment(signature, "signature-client.png");
    if (sig) attachments.push(sig);

    const secondVisitHtml = secondVisit?.date
      ? `<tr><td style="padding:8px 0;color:#66756e">2e passage</td><td style="padding:8px 0;font-weight:700">${escapeHtml(secondVisit.date)} à ${escapeHtml(secondVisit.time || "")}</td></tr>`
      : "";

    const html = `
      <div style="font-family:Arial,sans-serif;background:#f6f8f7;padding:24px;color:#10231b">
        <div style="max-width:680px;margin:auto;background:white;border:1px solid #e3ebe7;border-radius:18px;overflow:hidden">
          <div style="background:#138a5b;color:white;padding:22px">
            <div style="font-size:13px;opacity:.8">RAPPORT D'INTERVENTION · PASSAGE ${escapeHtml(passage || 1)}</div>
            <h1 style="margin:6px 0 0;font-size:24px">${escapeHtml(client)}</h1>
          </div>
          <div style="padding:22px">
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:8px 0;color:#66756e">Date</td><td style="padding:8px 0;font-weight:700">${escapeHtml(date)} · ${escapeHtml(start || "")}-${escapeHtml(end || "")}</td></tr>
              <tr><td style="padding:8px 0;color:#66756e">Adresse</td><td style="padding:8px 0;font-weight:700">${escapeHtml(address || "")}</td></tr>
              <tr><td style="padding:8px 0;color:#66756e">Prestation</td><td style="padding:8px 0;font-weight:700">${escapeHtml(type || "")}</td></tr>
              <tr><td style="padding:8px 0;color:#66756e">Technicien</td><td style="padding:8px 0;font-weight:700">${escapeHtml(technician)}${techEmail ? " · " + escapeHtml(techEmail) : ""}</td></tr>
              <tr><td style="padding:8px 0;color:#66756e">Paiement</td><td style="padding:8px 0;font-weight:700">${escapeHtml(payment || "Non renseigné")}</td></tr>
              ${secondVisitHtml}
            </table>
            <div style="margin-top:20px;padding-top:18px;border-top:1px solid #e3ebe7">
              <div style="font-size:13px;color:#66756e;margin-bottom:6px">RAPPORT DU TECHNICIEN</div>
              <div style="white-space:pre-wrap;line-height:1.55">${escapeHtml(report)}</div>
            </div>
            <div style="margin-top:18px;font-size:12px;color:#708078">
              Photos avant/après et signature client jointes au message lorsqu'elles sont disponibles.
            </div>
          </div>
        </div>
      </div>`;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [reportTo],
        subject: `Rapport intervention — ${client} — ${date}`,
        html,
        attachments,
      }),
    });

    const result = await resendResponse.json();
    if (!resendResponse.ok) {
      console.error("Resend error", result);
      return res.status(502).json({ ok: false, error: result?.message || "Échec de l'envoi Resend." });
    }

    return res.status(200).json({ ok: true, id: result.id });
  } catch (error) {
    console.error("send-report error", error);
    return res.status(500).json({ ok: false, error: "Erreur serveur pendant l'envoi du rapport." });
  }
}
