import styles from "../styles/tabbar.module.css";

const TABS = [
  { id: "today",    icon: "🗓", label: "Today"    },
  { id: "record",   icon: "🎙", label: "Record"   },
  { id: "history",  icon: "🕐", label: "History"  },
  { id: "settings", icon: "⚙️", label: "Settings" },
];

export default function TabBar({ active, onChange }) {
  return (
    <nav className={styles.nav}>
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`${styles.item} ${active === t.id ? styles.active : ""}`}
          onClick={() => onChange(t.id)}
        >
          <span className={styles.icon}>{t.icon}</span>
          <span className={styles.label}>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
