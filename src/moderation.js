// Name and message moderation for Nitro Pitch, in one place for the server and the game.
// The Worker imports it; src/worker.js also serves the same code to the game page (window.NPModeration), so the
// rename box, name display, private messages and the server all use one list.
//   badName(name)     -> true for offensive, slur, sexual or hateful names, including leetspeak and s p a c e d variants
//   safeName(name)    -> the name, or a neutral "Player1234" (stable for the same name) if it is offensive
//   filterText(text)  -> chat-style filtering for messages: swears and slurs become ***
// Scunthorpe problem: short words that hide inside ordinary words (ass, cock, cum, tit, rape, nazi, shit...) only
// count as whole words or word parts split by spaces, case or digits; long unambiguous ones count anywhere.
export function makeModeration() {
  // anywhere in the name once spaces, dots, digits used as letters and case are ignored
  const ANYWHERE = [
    "f+u+c+k", "f+v+c+k", "f+u+c+c", "f+c+k+(?:e+r|i+n|e+d)", "m+o+t+h+e+r+f+", "c+u+n+t", "n+i+g+g", 
    "f+a+g+g+[o0e]+t", "f+a+g+[o0]+t", "w+h+o+r+e", "s+l+u+t", "b+i+t+c+h", "c+o+c+k+s+u+c+k", "a+s+s+h+o+l+e", "a+r+s+e+h+o+l+e", "d+i+c+k+h+e+a+d",
    "s+h+i+t+h+e+a+d", "b+u+l+l+s+h+i+t", "d+i+c+k+s+u+c+k", "p+o+r+n", "p+e+n+i+s", "v+a+g+i+n+a", "d+i+l+d+o", "c+l+i+t+o+r", "j+i+z+z", "c+u+m+s+h+o+t",
    "b+l+o+w+j+o+b", "h+a+n+d+j+o+b", "r+a+p+i+s+t", "h+i+t+l+e+r", "n+a+z+i+s+m", "s+i+e+g+h+e+i+l", "h+e+i+l+h+i+t", "k+k+k", "w+h+i+t+e+p+o+w+e+r",
    "t+r+a+n+n+y", "w+e+t+b+a+c+k", "r+e+t+a+r+d", "p+e+d+o+p+h", "p+a+e+d+o+p+h", "m+o+l+e+s+t", "i+n+c+e+s+t", "h+e+n+t+a+i", "o+n+l+y+f+a+n+s",
    "s+e+x+y", "k+i+l+l+y+o+u+r+s+e+l+f", "k+i+l+l+u+r+s+e+l+f", "g+a+s+t+h+e", "s+u+c+k+m+y", "p+u+s+s+y", "e+r+e+c+t+i+o+n", "o+r+g+a+s+m",
    "m+a+s+t+u+r+b", "n+u+d+e+s", "b+o+o+b+s", "b+o+o+b+i+e", "t+i+t+t+i+e", "s+t+r+i+p+p+e+r", "b+a+s+t+a+r+d", "w+a+n+k+e+r"
  ];
  // only as a whole word (or a word part split by spaces, digits, case or punctuation), with common endings
  const WORDS = [
    "a+s+s+(?:e+s)?", "a+r+s+e+s?", "d+i+c+k+s?", "c+o+c+k+s?", "c+u+m+(?:s|m+i+n+g?)?", "t+i+t+s?", "r+a+p+e+(?:s|d|r+s?)?", "n+a+z+i+s?", "s+h+i+t+(?:s|t+y|e+r)?",
    "f+u+k+(?:s|e+r)?", "f+u+q", "f+k", "s+e+x", "a+n+a+l", "a+n+u+s", "n+u+d+e", "h+o+r+n+y", "b+o+o+b", "t+i+t+t+y", "p+r+i+c+k+s?", "w+a+n+k+s?", "t+w+a+t+s?",
    "d+y+k+e+s?", "c+h+i+n+k+s?", "s+p+i+c+s?", "k+i+k+e+s?", "g+o+o+k+s?", "b+e+a+n+e+r+s?", "c+o+o+n+s?", "j+a+p+s?", "p+e+d+o+s?", "p+a+e+d+o+s?", "k+y+s",
    "s+t+f+u", "w+t+f", "t+h+o+t+s?", "n+i+g+a+s?", "n+e+g+r+o+s?", "f+a+g+s?", "h+o+m+o+s?", "l+e+s+b+o+s?", "m+i+l+f+s?", "h+o+o+k+e+r+s?", "b+o+n+e+r+s?"
  ];
  // ordinary words and names that contain a listed stem; removed before the ANYWHERE check
  const SAFE = ["scunthorpe", "therapist", "cockburn", "dickens", "penistone", "sussex", "essex", "middlesex", "classic", "assassin", "arsenal", "shitake", "shiitake",
    "matsushita", "ashita", "hancock", "peacock", "cocktail", "cockpit", "grape", "drape", "skyscraper", "scrape", "document", "cucumber", "pornstar", "titan", "title",
    "butterfly", "spice", "nigeria", "niger", "snigger", "analyst", "analysis", "banana", "canal", "japan", "raccoon", "cocoon", "tycoon", "hello", "sexton", "unisex", "therapy"];
  const LEET = { "0": "o", "1": "i", "!": "i", "|": "i", "3": "e", "4": "a", "@": "a", "5": "s", "$": "s", "7": "t", "+": "t", "8": "b", "9": "g", "€": "e", "£": "l" };
  const anywhere = new RegExp(ANYWHERE.join("|"));
  const word = new RegExp("^(?:" + WORDS.join("|") + ")$");
  const plain = s => String(s ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  const leet = s => [...s].map(c => LEET[c] || c).join("");
  const letters = s => s.replace(/[^a-z]/g, "");
  function stripSafe(s) { for (const w of SAFE) s = s.split(w).join("~"); return s; }
  function tokens(raw) {
    // split on case changes (BigAss -> Big Ass) before lowering, then on anything that isn't a letter
    const spaced = String(raw ?? "").replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2"), out = new Set();
    for (const form of [plain(spaced), leet(plain(spaced))]) {
      const parts = form.split(/[^a-z]+/).filter(Boolean);
      parts.forEach(p => out.add(p));
      // s p a c e d   o u t letters join back into one word
      let run = "";
      for (const p of [...parts, ""]) { if (p.length === 1) run += p; else { if (run.length > 1) out.add(run); run = ""; } }
    }
    return [...out];
  }
  function badName(name) {
    const s = String(name ?? "");
    if (!s.trim()) return false;
    for (const form of [letters(plain(s)), letters(leet(plain(s)))]) {
      const squeezed = stripSafe(form);
      if (squeezed.split("~").some(part => anywhere.test(part))) return true;
      if (word.test(form)) return true;
    }
    return tokens(s).some(t => word.test(t) || (!SAFE.some(w => t.includes(w)) && anywhere.test(t)));
  }
  function safeName(name, fallback = "Player") {
    const s = String(name ?? "");
    if (!badName(s)) return s;
    let h = 2166136261;
    for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619);
    return fallback + String((h >>> 0) % 9000 + 1000);
  }
  // messages: each word (anything between spaces) that would be a bad name becomes *** (other text is left alone)
  function filterText(text) {
    return String(text ?? "").replace(/\S+/g, w => w.length > 1 && badName(w) ? "*".repeat(Math.min([...w].length, 6)) : w);
  }
  return { badName, safeName, filterText };
}
export const moderation = makeModeration();
export const { badName, safeName, filterText } = moderation;
// the same code for the game page: the Worker inlines this before the game script
export const moderationScript = "window.NPModeration=Object.freeze((" + makeModeration.toString() + ")());";
