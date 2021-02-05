// Node modules not acutally needed in a deno project, however for now
// I'm keeping it so that I can use ESLint.
export {};

console.log("Hello World");
Deno.stdout.write(new TextEncoder().encode("Wahoo Brogle"));