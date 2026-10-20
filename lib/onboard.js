import { askDocs, parseAnswer, searchDocs } from "./docs.js";

export const STEPS = [
  {
    id: "start",
    en: "How do I get started on ai.pharos.xyz?",
    pt: "Como começo no ai.pharos.xyz?",
    triedEn: "Open ai.pharos.xyz and follow the docs for the first step.",
    triedPt: "Abrir ai.pharos.xyz e seguir o primeiro passo da docs.",
    fixEn: "A getting-started page should name https://ai.pharos.xyz, say it is the AI workbench, and say what to click first. Sending people to Anvita Flow or to Chain MCP does not onboard them onto that site.",
    fixPt: "A página de início deveria citar https://ai.pharos.xyz, dizer que é o workbench, e qual é o primeiro clique. Mandar para o Anvita Flow ou para o Chain MCP não entra nesse site.",
    goal: "Self-onboard into AI.PHAROS using only official Pharos developer docs. No blogs.",
  },
  {
    id: "docs-mcp",
    en: "How do I connect to the official Developer Docs MCP, and which tools does it expose?",
    pt: "Como conecto no Developer Docs MCP oficial e quais ferramentas ele expõe?",
    triedEn: "Find the Docs MCP URL and the tool names, using only Docs MCP.",
    triedPt: "Achar a URL do Docs MCP e os nomes das ferramentas, só pela Docs MCP.",
    fixEn: "The docs should split this server from Chain MCP. This client is https://docs.pharos.xyz/~gitbook/mcp and the tools that answered me are askQuestion, searchDocumentation and getPage. The current reply describes https://mcp.pharos.xyz/mcp and says the docs server is not a thing.",
    fixPt: "A docs deveria separar este servidor do Chain MCP. Este cliente é https://docs.pharos.xyz/~gitbook/mcp e as ferramentas que me responderam são askQuestion, searchDocumentation e getPage. A resposta atual descreve https://mcp.pharos.xyz/mcp e diz que o servidor da docs não existe.",
    goal: "Need the MCP URL plus askQuestion, searchDocumentation, getPage.",
  },
  {
    id: "chain-mcp",
    en: "How do I connect to the Pharos Chain MCP and which tools can I call?",
    pt: "Como conecto no Chain MCP da Pharos e quais ferramentas posso chamar?",
    triedEn: "Get a Chain MCP URL I can actually connect to.",
    triedPt: "Pegar uma URL do Chain MCP em que eu consiga conectar.",
    fixEn: "",
    fixPt: "",
    goal: "Need the hosted MCP URL and the names of the read tools.",
  },
  {
    id: "wallet",
    en: "How do I connect a wallet on AI.PHAROS?",
    pt: "Como conecto uma carteira no AI.PHAROS?",
    triedEn: "Connect a wallet inside the AI.PHAROS workbench, from the docs.",
    triedPt: "Conectar a carteira dentro do workbench AI.PHAROS, pela docs.",
    fixEn: "The wallet page should say if ai.pharos.xyz has a Connect Wallet button, which wallets it accepts, and that read-only Chain MCP does not need one. A generic wallet list is not that flow.",
    fixPt: "A página de wallet deveria dizer se o ai.pharos.xyz tem botão Connect Wallet, quais carteiras aceita, e que o Chain MCP só de leitura não precisa de carteira. Uma lista genérica não é esse fluxo.",
    goal: "Onboarding into the ai.pharos.xyz workbench from developer docs only.",
  },
  {
    id: "registry",
    en: "What is the official USDC contract address on Pharos Pacific Mainnet?",
    pt: "Qual é o contrato oficial do USDC na Pharos Pacific Mainnet?",
    triedEn: "Copy the official Pacific USDC address from the docs.",
    triedPt: "Copiar o endereço oficial do USDC na Pacific, pela docs.",
    fixEn: "",
    fixPt: "",
    goal: "Token registry, Pacific section only.",
  },
  {
    id: "send",
    en: "How do I send a signed transaction on Pharos Pacific Mainnet through Chain MCP?",
    pt: "Como envio uma transação assinada na Pacific pelo Chain MCP?",
    triedEn: "See if the docs explain a send, without broadcasting one.",
    triedPt: "Ver se a docs explica um envio, sem disparar transação.",
    fixEn: "",
    fixPt: "",
    goal: "Need send_raw_transaction or the docs equivalent.",
  },
];

const THIN = /\b(not (specified|mentioned)|does not (mention|cover|specify)|no (official )?page|insufficient)\b/i;

function admitsGap(text) {
  const t = String(text ?? "").replace(/[’‘]/g, "'").toLowerCase();
  return /\b(cannot find|can't find|could not find|do not document|does not document|don't document|doesn't document|not documented|no instructions|not a developer docs mcp)\b/.test(t);
}

export function gradeAnswer(parsed) {
  const text = `${parsed?.answer ?? ""}`;
  const gap = admitsGap(text);
  if (!parsed?.found) return "broke";
  if (!parsed?.sources?.length) return gap ? "broke" : "thin";
  if (gap) return "broke";
  if (THIN.test(text) && text.length < 400) return "thin";
  return "ok";
}

export function presentStep(step, parsed, searchHits, lang) {
  const grade = gradeAnswer(parsed);
  const query = lang === "pt" ? step.pt : step.en;
  const note =
    grade === "broke"
      ? lang === "pt"
        ? "Resposta errada, faltando ou confusa. Não completei com busca fora da docs."
        : "Wrong, missing, or confusing. I did not fill this from outside the docs."
      : grade === "thin"
        ? lang === "pt"
          ? "Resposta frouxa ou sem página de origem."
          : "Thin answer, or no source page."
        : lang === "pt"
          ? "A Docs MCP destravou este passo, com página de origem."
          : "Docs MCP got me unstuck here, with a source page.";
  return {
    id: step.id,
    tried: lang === "pt" ? step.triedPt : step.triedEn,
    query,
    title: query,
    grade,
    note,
    fix: grade === "ok" ? "" : (lang === "pt" ? step.fixPt : step.fixEn),
    answer: parsed?.answer ?? "",
    sources: parsed?.sources ?? [],
    search: (searchHits ?? []).slice(0, 3).map((h) => ({ title: h.title, link: h.link })),
  };
}

export function closingNote(steps, lang, extra = "") {
  const gaps = steps.filter((s) => s.grade !== "ok");
  const chain = steps.find((s) => s.id === "chain-mcp");
  const usdc = steps.find((s) => s.id === "registry");
  const head = lang === "pt"
    ? `Não entrei no ai.pharos.xyz. A docs não descreve esse site. ${gaps.length} buraco(s) no log.`
    : `I did not get into ai.pharos.xyz. The docs never describe that site. ${gaps.length} gap(s) in the log.`;
  const ran = [];
  if (chain?.grade === "ok") {
    ran.push(lang === "pt"
      ? "O que rodou: a Docs MCP passou a URL do Chain MCP (https://mcp.pharos.xyz/mcp) e a lista de ferramentas."
      : "What ran: Docs MCP gave the Chain MCP URL (https://mcp.pharos.xyz/mcp) and the tool list.");
  }
  if (usdc?.grade === "ok") {
    ran.push(lang === "pt"
      ? "Também passou o USDC oficial da Pacific: 0xc879c018db60520f4355c26ed1a6d572cdac1815."
      : "It also gave official Pacific USDC: 0xc879c018db60520f4355c26ed1a6d572cdac1815.");
  }
  return [head, ...ran, extra].filter(Boolean).join(" ");
}

export async function runOnboarding(docsClient, lang = "en") {
  const steps = [];
  for (const step of STEPS) {
    const question = lang === "pt" ? step.pt : step.en;
    const raw = await askDocs(docsClient, question, step.goal);
    const parsed = parseAnswer(raw);
    let searchHits = [];
    if (gradeAnswer(parsed) !== "ok") {
      searchHits = await searchDocs(docsClient, question, 3);
    }
    steps.push(presentStep(step, parsed, searchHits, lang));
  }
  const broke = steps.filter((s) => s.grade === "broke").length;
  const thin = steps.filter((s) => s.grade === "thin").length;
  const ok = steps.filter((s) => s.grade === "ok").length;
  const gaps = steps.filter((s) => s.grade !== "ok").map((s) => ({
    id: s.id,
    query: s.query,
    problem: s.note,
    fix: s.fix,
  }));
  const headline =
    lang === "pt"
      ? `Log só com Docs MCP: ${ok} passos ok, ${thin} frouxos, ${broke} buracos.`
      : `Docs-only log: ${ok} steps cleared, ${thin} thin, ${broke} gaps.`;
  return { ok: true, headline, counts: { ok, thin, broke }, steps, gaps, ran: closingNote(steps, lang) };
}
