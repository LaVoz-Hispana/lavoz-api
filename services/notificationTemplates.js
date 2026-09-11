export const marketplaceTypes = new Set([
  "escrow_invited", "student_accepted", "student_declined", "milestone_added",
  "milestone_approved", "change_requested", "artifact_submitted", "escrow_completed", "escrow_reopened",
]);
export const notificationTypes = new Set([...marketplaceTypes, "comment", "reaction", "follow"]);

export function normalizeLanguage(value) {
  const language = String(value || "").trim().toLowerCase();
  return /^(es($|[-_])|español$|espanol$|spanish$)/.test(language) ? "es" : "en";
}

const copy = {
  en: {
    escrow_invited: "You have been invited to an escrow",
    student_accepted: "Your escrow invitation was accepted",
    student_declined: "Your escrow invitation was declined",
    milestone_added: "A milestone was added to your escrow",
    milestone_approved: "Your milestone was approved",
    change_requested: "Changes were requested for your deliverable",
    artifact_submitted: "A deliverable was submitted to your escrow",
    escrow_completed: "Your escrow was completed",
    escrow_reopened: "Your escrow was reopened",
    comment: "You have a new comment on your post",
    reaction: "Your post received a reaction",
    follow: "You have a new follower",
    action: "View on PostStation",
    preferences: "Manage email preferences in Edit Profile",
  },
  es: {
    escrow_invited: "Te han invitado a un escrow",
    student_accepted: "Tu invitación al escrow fue aceptada",
    student_declined: "Tu invitación al escrow fue rechazada",
    milestone_added: "Se agregó un hito a tu escrow",
    milestone_approved: "Tu hito fue aprobado",
    change_requested: "Se solicitaron cambios en tu entrega",
    artifact_submitted: "Se presentó una entrega en tu escrow",
    escrow_completed: "Tu escrow se completó",
    escrow_reopened: "Tu escrow se reabrió",
    comment: "Tienes un nuevo comentario en tu publicación",
    reaction: "Tu publicación recibió una reacción",
    follow: "Tienes un nuevo seguidor",
    action: "Ver en PostStation",
    preferences: "Administra tus preferencias de correo en Editar perfil",
  },
};

export function clientBaseUrl(value) {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("Invalid CLIENT_URL");
  }
  return url.href.replace(/\/$/, "");
}

const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

export function renderNotification(notification, language, clientUrl) {
  if (!notificationTypes.has(notification.type)) throw new Error("Unknown notification type");
  const locale = normalizeLanguage(language);
  const strings = copy[locale];
  const { type } = notification;
  const url = clientBaseUrl(clientUrl);
  return {
    subject: `PostStation: ${strings[type]}`,
    text: `${strings[type]}.\n\n${strings.action}: ${url}\n\n${strings.preferences}`,
    html: `<html lang="${locale}"><body><p>${strings[type]}.</p><p><a href="${escapeHtml(url)}">${strings.action}</a></p><p>${strings.preferences}</p></body></html>`,
  };
}
