import { spawn } from "node:child_process";

const presentationUrls = [
  "https://marketvaley.vercel.app/presentation/report",
  "https://marketvaley.vercel.app/p/campaign-fa5197f4",
];

if (process.argv.includes("--print")) {
  console.log(presentationUrls.join("\n"));
  process.exit(0);
}

function openUrl(url) {
  const command = process.platform === "darwin"
    ? { executable: "open", args: [url] }
    : process.platform === "win32"
      ? { executable: "cmd", args: ["/c", "start", "", url] }
      : { executable: "xdg-open", args: [url] };

  const child = spawn(command.executable, command.args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

for (const url of presentationUrls) openUrl(url);

console.log("발표용 리포트와 랜딩페이지를 브라우저에서 열었습니다.");
