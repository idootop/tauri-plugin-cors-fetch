let greetInputEl;
let greetMsgEl;

async function fetchData() {
  const url = greetInputEl.value || "https://api.openai.com";
  try {
    const response = await fetch(url);
    const data = await response.json();
    greetMsgEl.textContent = JSON.stringify(data, undefined, 4);
  } catch (error) {
    greetMsgEl.textContent = error.toString();
  }
}

window.CORSFetch.config({
  include: [/^https?:\/\//i],
  exclude: ["https://api.openai.com/v1/chat/completions"],
  proxy: {
    all: "socks5://127.0.0.1:7890",
  },
});

window.addEventListener("DOMContentLoaded", () => {
  greetInputEl = document.querySelector("#greet-input");
  greetMsgEl = document.querySelector("#greet-msg");
  document.querySelector("#greet-form").addEventListener("submit", (e) => {
    e.preventDefault();
    fetchData();
  });
});
