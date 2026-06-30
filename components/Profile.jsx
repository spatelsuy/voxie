import { signIn, signOut, useSession } from "next-auth/react";
import styles from "../styles/profile.module.css";

export default function Profile() {
  const { data: session, status } = useSession();
  const isSignedIn = status === "authenticated";

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div className={styles.title}>Profile</div>
        <div className={styles.sub}>Sign in to sync and personalize your experience</div>
      </div>

      <div className={styles.body}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>{isSignedIn ? "Signed in" : "Login options"}</div>
          <div className={styles.cardText}>
            {isSignedIn
              ? `Signed in as ${session.user?.email || session.user?.name || "Google user"}.`
              : "Connect your account to continue with Kahija across devices."}
          </div>

          {isSignedIn ? (
            <button className={styles.googleBtn} onClick={() => signOut()}>
              Sign out
            </button>
          ) : (
            <button className={styles.googleBtn} onClick={() => signIn("google")}>
              Continue with Google
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
