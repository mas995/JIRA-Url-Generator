const DEFAULT_PREFIXES = ["CBGAM-", "MESP-", "EBPO-"];
const DEFAULT_URL_TEMPLATE = "https://sherwin-williams.atlassian.net/browse/";

const prefixInput = document.getElementById("patternPrefix");
const urlTemplateInput = document.getElementById("urlTemplate");
const statusElement = document.getElementById("statusMessage");
const boomButton = document.getElementById("boomButton");

function showStatus(message, type = "info") {
  if (!statusElement) {
    return;
  }

  statusElement.textContent = message;
  statusElement.className = `status ${type}`;
}

function parsePrefixes(rawPrefixValue) {
  const parsed = rawPrefixValue
    .split(",")
    .map((prefix) => prefix.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : DEFAULT_PREFIXES;
}

function saveSettings(patternPrefixValue, urlTemplateValue) {
  chrome.storage.sync.set({
    patternPrefix: patternPrefixValue,
    urlTemplate: urlTemplateValue,
  });
}

function loadSettings() {
  chrome.storage.sync.get(["patternPrefix", "urlTemplate"], (result) => {
    const savedPrefixes = result.patternPrefix || DEFAULT_PREFIXES.join(", ");
    const savedUrlTemplate = result.urlTemplate || DEFAULT_URL_TEMPLATE;

    prefixInput.value = savedPrefixes;
    urlTemplateInput.value = savedUrlTemplate;
  });
}

boomButton.addEventListener("click", () => {
  const patternPrefixValue = prefixInput.value.trim();
  const urlTemplateValue = urlTemplateInput.value.trim() || DEFAULT_URL_TEMPLATE;
  const patternPrefixes = parsePrefixes(patternPrefixValue);

  saveSettings(patternPrefixValue || DEFAULT_PREFIXES.join(", "), urlTemplateValue);
  showStatus("Updating PR fields...", "info");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0) {
      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          world: "MAIN",
          func: fillPullRequestData,
          args: [patternPrefixes, urlTemplateValue],
        },
        (results) => {
          if (chrome.runtime.lastError) {
            showStatus(`Error: ${chrome.runtime.lastError.message}`, "error");
            return;
          }

          const result = results && results[0] ? results[0].result : null;

          if (!result) {
            showStatus("No result returned from page script.", "error");
            return;
          }

          if (result.success) {
            showStatus(result.message, "success");
          } else {
            showStatus(result.message, "error");
          }
        }
      );
    } else {
      showStatus("No active tab found.", "error");
    }
  });
});

loadSettings();

async function fillPullRequestData(prefixes, urlTemplate) {
  function isVisible(element) {
    return Boolean(element && element.getClientRects().length > 0);
  }

  function findFirstVisibleField(selectors) {
    for (const selector of selectors) {
      const candidates = document.querySelectorAll(selector);

      for (const candidate of candidates) {
        if (isVisible(candidate) && !candidate.disabled && !candidate.readOnly) {
          return candidate;
        }
      }
    }

    return null;
  }

  function setNativeValue(element, value) {
    if (!element) {
      return;
    }

    const prototype =
      element.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    const valueSetter = descriptor && descriptor.set;

    if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }
  }

  function updateValueTracker(element, previousValue) {
    const tracker = element._valueTracker;

    if (tracker && typeof tracker.setValue === "function") {
      tracker.setValue(previousValue);
    }
  }

  function dispatchValueEvents(element, value) {
    const beforeInputEvent =
      typeof InputEvent === "function"
        ? new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: value,
        })
        : new Event("beforeinput", { bubbles: true, cancelable: true });
    const inputEvent =
      typeof InputEvent === "function"
        ? new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: value,
        })
        : new Event("input", { bubbles: true });

    element.dispatchEvent(beforeInputEvent);
    element.dispatchEvent(inputEvent);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function overwriteInputLikeValue(selectors, value) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const element = findFirstVisibleField(selectors);

      if (!element) {
        await wait(80);
        continue;
      }

      element.focus();

      const previousValue = element.value;
      setNativeValue(element, "");
      updateValueTracker(element, previousValue);
      dispatchValueEvents(element, "");

      const intermediateValue = element.value;
      setNativeValue(element, value);
      updateValueTracker(element, intermediateValue);
      dispatchValueEvents(element, value);

      element.blur();

      await wait(80);

      if (element.value === value) {
        return true;
      }
    }

    return false;
  }

  const escapedPrefixes = prefixes.map((prefix) =>
    prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const regex = new RegExp(`(${escapedPrefixes.join("|")})\\d+`, "g");
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
    const compareBranchRaw = branches?.[1] || "unknown-compare-branch";
    const compareBranch = decodeURIComponent(compareBranchRaw.split(/[?#]/)[0]);

    // Construct the title
    const title = `${uniquePatterns.join(
      ", "
    )}: Merging ${compareBranch} to ${baseBranch}`;

    // Locate the PR title and description fields
    const titleSelectors = [
      "input[name='pull_request[title]'][data-component='input']",
      "input[aria-labelledby~='pull_request_title_header']",
      "input[aria-labelledby='pull_request_title_header']",
      "input#pull_request_title",
      "input[name='pull_request[title]']",
      "input.js-issue-title",
      "input[aria-label='Add a title']",
      "input[placeholder='Title']",
      "input[data-testid*='title' i]",
    ];
    const descriptionSelectors = [
      "textarea#pull_request_body",
      "textarea[name='pull_request[body]']",
      "textarea[aria-label='Add a description']",
      "textarea[placeholder*='description' i]",
    ];

    // Populate the title and description fields
    let titleUpdated = false;
    let descriptionUpdated = false;

    titleUpdated = await overwriteInputLikeValue(titleSelectors, title);

    descriptionUpdated = await overwriteInputLikeValue(
      descriptionSelectors,
      `Related JIRA tickets:\n${jiraLinks.join("\n")}`
    );

    if (!titleUpdated) {
      return {
        success: false,
        message:
          "JIRA links were found, but the PR title field was not updated. Try clicking inside the title box once, then press BOOM again.",
      };
    }

    return {
      success: true,
      message: descriptionUpdated
        ? `Updated PR title and description with ${uniquePatterns.length} ticket(s).`
        : `Updated PR title with ${uniquePatterns.length} ticket(s).`,
    };
  } else {
    return {
      success: false,
      message: "No matching JIRA ticket patterns found on this page.",
    };
  }
}
