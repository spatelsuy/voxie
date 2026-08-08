export function getExampleDateLabel() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  // Days since the most recent Monday (0 if today IS Monday)
  const daysSinceMonday = (day + 6) % 7;

  // Find this week's Monday, then jump forward to next week's Wednesday
  const thisMonday = new Date(d);
  thisMonday.setDate(d.getDate() - daysSinceMonday);

  const nextWednesday = new Date(thisMonday);
  nextWednesday.setDate(thisMonday.getDate() + 9); // Monday + 7 (next Monday) + 2 (Wed)

  const months = ["January","February","March","April","May","June","July",
                   "August","September","October","November","December"];
  const dayOfMonth = nextWednesday.getDate();
  const suffix =
    (dayOfMonth % 10 === 1 && dayOfMonth !== 11) ? "st" :
    (dayOfMonth % 10 === 2 && dayOfMonth !== 12) ? "nd" :
    (dayOfMonth % 10 === 3 && dayOfMonth !== 13) ? "rd" : "th";

  return `${months[nextWednesday.getMonth()]} ${dayOfMonth}${suffix}`;
}