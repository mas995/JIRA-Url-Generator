document.getElementById("boomButton").addEventListener("click", () => {
  const patternPrefixes = ["CBGAM-", "MESP-"];
  const urlTemplate =
    document.getElementById("urlTemplate").value ||
    "https://sherwin-williams.atlassian.net/browse/";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0) {
      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          func: findUniquePatterns,
          args: [patternPrefixes, urlTemplate],
        },
        (results) => {
          if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError.message);
            return;
          }
          if (results && results[0] && results[0].result) {
            const urls = results[0].result;
            if (urls.length > 0) {
              const urlString = urls.join("\n");
              navigator.clipboard.writeText(urlString).then(() => {
                alert("URLs copied to clipboard!");
              });
            } else {
              alert("No results found.");
            }
          }
        }
      );
    } else {
      console.error("No active tabs found.");
    }
  });
});

function findUniquePatterns(prefixes, urlTemplate) {
  const regex = new RegExp(`(${prefixes.join("|")})\\d+`, "g");
  const foundPatterns = document.body.innerText.match(regex) || [];

  // Filter out duplicates by converting to a Set and back to an array
  const uniquePatterns = [...new Set(foundPatterns)];

  // Map the unique patterns to their corresponding URLs
  return uniquePatterns.map((pattern) => `${urlTemplate}${pattern}`);
}
