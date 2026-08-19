import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { api } from "../../lib/api";
import WalletDisplay from "./WalletDisplay";
import Loader from "../ui/Loader";
import "../../styles/pages/wallet-setup.css";

interface WalletResponse {
  publicKey: string;
  privateKey: string;
}

// A single state to manage the UI phase of the component
type Status =
  | "initializing"
  | "creating"
  | "resetting"
  | "confirming"
  | "displaying"
  | "conflict"
  | "error";

const WalletSetup: React.FC = () => {
  const [walletData, setWalletData] = useState<WalletResponse | null>(null);
  const [status, setStatus] = useState<Status>("initializing");

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Mutation for creating the wallet
  const { mutate: createWallet } = useMutation<WalletResponse, Error>({
    mutationFn: () => api.post("/wallet").then((res) => res.data),
    onSuccess: (data) => {
      setWalletData(data);
      setStatus("displaying");
    },
    onError: (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setStatus("conflict");
      } else {
        setStatus("error");
      }
    },
  });

  // Mutation for confirming wallet setup (graduating the user)
  const { mutate: confirmWallet } = useMutation({
    mutationFn: () => api.post("/wallet/confirm"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
      navigate("/home", { replace: true });
    },
    onMutate: () => {
      setStatus("confirming");
    },
    onError: () => {
      setStatus("error");
    },
  });

  // Mutation for resetting the wallet
  const { mutate: resetWallet } = useMutation<WalletResponse, Error>({
    mutationFn: () => api.post("/wallet/reset").then((res) => res.data),
    onSuccess: (data) => {
      setWalletData(data);
      setStatus("displaying");
    },
    onMutate: () => {
      setStatus("resetting");
    },
    onError: () => {
      setStatus("error");
    },
  });

  // Trigger initial creation on mount
  useEffect(() => {
    setStatus("creating");
    createWallet();
  }, []); // The empty dependency array is crucial to run this only once.

  const renderContent = () => {
    switch (status) {
      case "creating":
        return <Loader text="creating your secure wallet..." />;
      case "resetting":
        return <Loader text="resetting wallet..." />;
      case "confirming":
        return <Loader text="finalizing setup..." />;
      case "displaying":
        if (walletData) {
          return (
            <WalletDisplay
              publicKey={walletData.publicKey}
              privateKey={walletData.privateKey}
              onDone={confirmWallet}
            />
          );
        }
        return <Loader text="an error occurred, please refresh" />; // Fallback
      case "conflict":
        return (
          <div className="wallet-setup-step">
            <h2>wallet already exists</h2>
            <p>
              your wallet was already created. if you saved your private key,
              continue.
              <br />
              if not, you can create a new wallet. the old one will be lost
              forever.
            </p>
            <div className="wallet-setup-actions">
              <button
                onClick={() => confirmWallet()}
                className="wallet-setup-button wallet-setup-button--secondary"
              >
                continue
              </button>
              <button
                onClick={() => resetWallet()}
                className="wallet-setup-button"
              >
                reset and create new wallet
              </button>
            </div>
          </div>
        );
      case "error":
        return (
          <div className="wallet-setup-step">
            <h1>error</h1>
            <p className="wallet-setup-error">
              an error occurred. please try again.
            </p>
            <button
              onClick={() => {
                setStatus("creating");
                createWallet();
              }}
              className="wallet-setup-button"
            >
              try again
            </button>
          </div>
        );
      case "initializing":
      default:
        return <Loader text="initializing..." />;
    }
  };

  return (
    <div className="wallet-setup-overlay">
      <div className="wallet-setup-modal">{renderContent()}</div>
    </div>
  );
};

export default WalletSetup;
