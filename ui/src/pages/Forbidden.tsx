import React from "react";
import { useNavigate } from "react-router-dom";
import PageLayout from "../components/layout/PageLayout";

const Forbidden: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PageLayout>
      <article className="max-w-2xl mx-auto text-center">
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ color: "#ff6b6b", marginBottom: "1rem" }}>
            access forbidden
          </h1>
          <p
            style={{
              fontSize: "1.1rem",
              color: "var(--pico-muted-color)",
              marginBottom: "1rem",
            }}
          >
            you don't have permission to access this resource
          </p>
          <p style={{ color: "#555", fontSize: "0.9rem" }}>error code: 403</p>
        </div>

        <div
          style={{
            backgroundColor: "#111",
            padding: "1.5rem",
            borderRadius: "4px",
            marginBottom: "2rem",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "var(--pico-muted-color)",
              lineHeight: "1.6",
            }}
          >
            this could be due to:
          </p>
          <ul
            style={{
              margin: "1rem 0 0 0",
              paddingLeft: "1.5rem",
              textAlign: "left",
              color: "var(--pico-muted-color)",
            }}
          >
            <li>your account has been suspended</li>
            <li>you're trying to access a restricted area</li>
            <li>your session has expired</li>
          </ul>
        </div>

        <div className="flex gap-4 justify-center">
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="secondary px-6 py-3"
          >
            go to login
          </button>
          <button
            onClick={() => navigate("/home")}
            className="px-6 py-3"
          >
            go to home
          </button>
        </div>
      </article>
    </PageLayout>
  );
};

export default Forbidden;
