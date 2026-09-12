export function renderBall(number) {
  return `<span class="ball ${ballColor(number)}">${number}</span>`;
}

export function ballColor(number) {
  if (number <= 10) return "yellow";
  if (number <= 20) return "blue";
  if (number <= 30) return "red";
  if (number <= 40) return "gray";
  return "green";
}
