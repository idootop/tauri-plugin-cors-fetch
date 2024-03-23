const { invoke } = window.__TAURI__.core;

let greetInputEl;
let greetMsgEl;

async function greet() {
  const input = !greetInputEl.value
    ? "https://api.openai.com"
    : greetInputEl.value;
  fetch(input)
    .then((response) => response.json())
    .then(
      (data) => (greetMsgEl.textContent = JSON.stringify(data, undefined, 4))
    )
    .catch((error) => (greetMsgEl.textContent = error.toString()));
}

window.addEventListener("DOMContentLoaded", () => {
  greetInputEl = document.querySelector("#greet-input");
  greetMsgEl = document.querySelector("#greet-msg");
  document.querySelector("#greet-form").addEventListener("submit", (e) => {
    e.preventDefault();
    greet();
  });
});
