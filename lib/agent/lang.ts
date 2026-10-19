// Words that are German but not English ("was", "die", "ein" are deliberately absent: they are also English words).
const GERMAN_HINTS =
  /\b(der|das|ich|ist|und|wie|nicht|wann|wo|kann|muss|meine?|habe|bekomme|wieviel|viele|wird|werden|für|eine|krank|urlaub|schicht|zuschlag|überstunden|dürfen|darf|mich|mir|sie|oder|bei|mit|von)\b|[äöüß]/i;

/** Cheap DE/EN guess for logging and a retrieval hint when the client sends no locale. */
export function detectLang(text: string): "de" | "en" {
  const hits = text.toLowerCase().match(new RegExp(GERMAN_HINTS.source, "gi"))?.length ?? 0;
  // umlauts/ß are a strong signal on their own; otherwise require two German function words
  return hits >= 2 || /[äöüß]/i.test(text) ? "de" : "en";
}
