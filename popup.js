document.getElementById("boomButton").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0) {
      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          func: findPatterns,
        },
        (results) => {
          if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError.message);
            return;
          }
          if (results && results[0] && results[0].result) {
            const uniquePatterns = [...new Set(results[0].result)];
            const urls = uniquePatterns.map((pattern) => `${pattern}`);
            const urlString = urls.join("\n");
            navigator.clipboard.writeText(urlString).then(() => {
              alert("URLs copied to clipboard!");
            });
          }
        }
      );
    } else {
      console.error("No active tabs found.");
    }
  });
});

function findPatterns() {
  const patterns = ["MESP-", "CBGAM-"]; // Example patterns, make this configurable
  const foundPatterns = [];
  const regex = new RegExp(patterns.join("|"), "g");
  document.body.innerText
    .match(regex)
    ?.forEach((match) => foundPatterns.push(match));
  return foundPatterns;
}
