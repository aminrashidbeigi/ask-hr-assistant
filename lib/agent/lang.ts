const GERMAN_HINTS =
  /\b(der|die|das|ich|ist|und|wie|nicht|wann|was|wo|kann|muss|meine?|mein|habe|bekomme|wieviel|viele|wird|werden|für|ein|eine|krank|urlaub|schicht|zuschlag|überstunden)\b|[äöüß]/i;

/** Cheap DE/EN guess for logging and a retrieval hint when the client sends no locale. */
export function detectLang(text: string): "de" | "en" {
  const hits = text.toLowerCase().match(new RegExp(GERMAN_HINTS.source, "gi"))?.length ?? 0;
  return hits >= 1 ? "de" : "en";
}
