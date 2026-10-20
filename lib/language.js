const EN_MARKERS = ["what", "who", "is", "the", "how", "much", "does", "of", "tell", "me", "about", "show", "explain", "which", "are", "this", "contract", "wallet", "owner", "balance", "supply", "and", "has", "have", "can", "you", "it", "please", "help", "hi", "hello", "thanks"];
const PT_MARKERS = ["o", "que", "qual", "quem", "e", "do", "da", "de", "quanto", "saldo", "dono", "carteira", "mostra", "explica", "esse", "este", "contrato", "tem", "voce", "pode", "por", "favor", "sobre", "ele", "isso", "os", "as", "um", "uma", "na", "no", "ajuda", "oi", "ola", "obrigado", "bom", "dia"];

export function normalize(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** "en" or "pt"; ties keep the previous language of the conversation (default Portuguese). */
export function detectLanguage(question, fallback = "pt") {
  const words = normalize(String(question ?? "")).replace(/0x[0-9a-f]+/g, " ").split(/[^a-z']+/).filter(Boolean);
  const en = words.filter((w) => EN_MARKERS.includes(w)).length;
  const pt = words.filter((w) => PT_MARKERS.includes(w)).length;
  if (en > pt) return "en";
  if (pt > en) return "pt";
  return fallback;
}
