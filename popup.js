document.getElementById("boomButton").addEventListener("click", () => {
  const patternPrefixes = ["CBGAM-", "MESP-", "EBPO-"];
  const urlTemplate =
    document.getElementById("urlTemplate").value ||
    "https://sherwin-williams.atlassian.net/browse/";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0) {
      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          func: fillPullRequestData,
          args: [patternPrefixes, urlTemplate],
        },
        (results) => {
          if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError.message);
            return;
          }
        }
      );
    } else {
      console.error("No active tabs found.");
    }
  });
});

function fillPullRequestData(prefixes, urlTemplate) {
  const regex = new RegExp(`(${prefixes.join("|")})\\d+`, "g");
  const foundPatterns = document.body.innerText.match(regex) || [];

  // Filter out duplicates
  const uniquePatterns = [...new Set(foundPatterns)];

  if (uniquePatterns.length > 0) {
    // Build the JIRA links
    const jiraLinks = uniquePatterns.map(
      (pattern) => `${urlTemplate}${pattern}`
    );

    // Extract the base and compare branch names from the URL
    const urlParts = window.location.href.split("compare/");
    const branches = urlParts[1]?.split("...");
    const baseBranch = branches?.[0] || "unknown-base-branch";
    const compareBranch = branches?.[1] || "unknown-compare-branch";

    // Construct the title
    const title = `${uniquePatterns.join(
      ", "
    )}: Merging ${compareBranch} to ${baseBranch}`;

    // Locate the PR title and description fields
    const titleField = document.querySelector("input#pull_request_title");
    const descriptionField = document.querySelector(
      "textarea#pull_request_body"
    );

    // Populate the title and description fields
    if (titleField) {
      titleField.value = title;
    }

    if (descriptionField) {
      descriptionField.value = `Related JIRA tickets:\n${jiraLinks.join("\n")}`;
    }
  } else {
    console.error("No matching patterns found.");
  }
}
