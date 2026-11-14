import { describe, expect, it } from "vitest";
import { detectLang, extractPage } from "./extract";
import { decodeHtml, FetchPageError, publicHttpUrl } from "./fetch-page";

const SWEDISH_HOME = `<!doctype html>
<html lang="en-US">
  <head>
    <title>  EmbeddedArt –
      UV-sensorer </title>
    <style>.a { color: red }</style>
    <script>window.tracking = "spåra inte detta";</script>
  </head>
  <body class="has-cookie-banner">
    <header><nav><ul><li>Hem</li><li>Om oss</li><li>Kontakt</li></ul></nav></header>
    <div id="cookie-notice">Vi använder kakor för att förbättra din upplevelse.</div>
    <main>
      <h1>Sensorer för sjöbevakning</h1>
      <p>EmbeddedArt utvecklar <strong>UV-sensorer</strong> för sjöbevakning,<br>spaning och marina mätstationer.</p>
      <div class="cards">
        <div><h3>Mätstationer</h3><p>Vi bygger och driver mätstationer i Östersjön.</p></div>
        <div><h3>Försvar</h3><p>Våra system används av kunder inom försvar och säkerhet.</p></div>
      </div>
    </main>
    <footer>© EmbeddedArt AB, Karlskrona</footer>
  </body>
</html>`;

describe("extractPage", () => {
  const page = extractPage(SWEDISH_HOME);

  it("keeps the page's own Swedish words, å ä ö included", () => {
    expect(page.text).toContain("EmbeddedArt utvecklar UV-sensorer för sjöbevakning,");
    expect(page.text).toContain("Vi bygger och driver mätstationer i Östersjön.");
    expect(page.title).toBe("EmbeddedArt – UV-sensorer");
  });

  it("drops scripts, styles, menus, footers and cookie banners, but not a body with a cookie class", () => {
    for (const noise of ["spåra inte", "color: red", "Om oss", "kakor", "Karlskrona"]) {
      expect(page.text).not.toContain(noise);
    }
    expect(page.text).toContain("Sensorer för sjöbevakning");
  });

  it("separates blocks, so words from two blocks never run together", () => {
    expect(page.text).not.toMatch(/MätstationerVi|sjöbevakningEmbeddedArt/);
    expect(page.text).toContain("sjöbevakning,\nspaning");
    expect(page.text).not.toMatch(/\n{3,}| {2,}/);
  });

  it("says Swedish although the page declares en-US", () => {
    expect(page.lang).toBe("sv");
  });

  it("uses Readability for an article and leaves the sidebar out", () => {
    const paragraph = "<p>The call funds collaborative projects that test new sensor technology at sea, and it is open to small companies together with a research partner.</p>";
    const article = extractPage(
      `<html><head><title>Call for proposals</title></head><body>
         <div class="sidebar"><a href="/a">Related call one</a> <a href="/b">Related call two</a></div>
         <article><h1>Call for proposals</h1>${paragraph.repeat(8)}</article>
       </body></html>`,
    );
    expect(article.method).toBe("readability");
    expect(article.text).toContain("test new sensor technology at sea");
    expect(article.text).not.toContain("Related call one");
    expect(article.lang).toBe("en");
  });

  it("returns empty text for a page that only has scripts", () => {
    expect(extractPage(`<html><body><div id="root"></div><script>render()</script></body></html>`).text).toBe("");
  });
});

describe("detectLang", () => {
  it("falls back to the lang attribute when the text is too short to tell", () => {
    expect(detectLang("Techinova AB", "sv-SE")).toBe("sv");
    expect(detectLang("Techinova AB", "en")).toBe("en");
    expect(detectLang("Techinova AB")).toBe("other");
  });
});

describe("decodeHtml", () => {
  const latin1 = Uint8Array.from(Buffer.from("<p>Mätstationer i Östersjön</p>", "latin1"));

  it("reads the charset from the header", () => {
    expect(decodeHtml(latin1, "text/html; charset=ISO-8859-1")).toContain("Mätstationer i Östersjön");
  });

  it("reads the charset from a meta tag when the header has none", () => {
    const withMeta = Uint8Array.from(Buffer.from('<meta charset="windows-1252"><p>Mätstationer i Östersjön</p>', "latin1"));
    expect(decodeHtml(withMeta, "text/html")).toContain("Mätstationer i Östersjön");
  });

  it("defaults to UTF-8", () => {
    expect(decodeHtml(new TextEncoder().encode("<p>Sjöbevakning</p>"), null)).toContain("Sjöbevakning");
  });
});

describe("publicHttpUrl", () => {
  it("accepts public http and https addresses", () => {
    expect(publicHttpUrl("https://www.bluesciencepark.se/medlemmar/").hostname).toBe("www.bluesciencepark.se");
  });

  it.each([
    "not a url",
    "ftp://example.com/file",
    "file:///etc/passwd",
    "http://localhost:3000",
    "http://127.0.0.1/admin",
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://172.20.0.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/",
    "http://db.internal/",
  ])("refuses %s as permanent", (url) => {
    expect(() => publicHttpUrl(url)).toThrow(FetchPageError);
    try {
      publicHttpUrl(url);
    } catch (error) {
      expect((error as FetchPageError).permanent).toBe(true);
    }
  });
});
