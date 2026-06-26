"use client";

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { io, Socket } from "socket.io-client";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001";

interface Device {
  id: string;
  socketId: string;
  status: string;
  model?: string;
  androidOS?: string;
  battery?: number;
}

interface CommandResult {
  command: string;
  result: string;
  timestamp: number;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  devices: Device[];
  selectedDevice: string | null;
  setSelectedDevice: (id: string | null) => void;
  sendCommand: (command: string, payload?: any) => void;
  screenFrame: string | null;
  setScreenFrame: (frame: string | null) => void;
  commandResult: CommandResult | null;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  devices: [],
  selectedDevice: null,
  setSelectedDevice: () => {},
  sendCommand: () => {},
  screenFrame: null,
  setScreenFrame: () => {},
  commandResult: null,
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [screenFrame, setScreenFrame] = useState<string | null>(null);
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);

  const selectedDeviceRef = useRef<string | null>(null);
  useEffect(() => {
    selectedDeviceRef.current = selectedDevice;
  }, [selectedDevice]);

  useEffect(() => {
    const socket = io(SERVER_URL, {
      query: { role: "panel" },
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      socket.emit("get_devices");
    });

    socket.on("disconnect", () => setIsConnected(false));

    socket.on("device_list", (data: { devices: Device[] }) => {
      setDevices(data.devices);
      if (data.devices.length > 0 && !selectedDeviceRef.current) {
        setSelectedDevice(data.devices[0].id);
      }
    });

    socket.on("device_connected", (data: any) => {
      setDevices((prev) => {
        const exists = prev.find((d) => d.id === data.deviceId);
        if (exists) return prev;
        return [...prev, { ...data, id: data.deviceId, status: "online" }];
      });
    });

    socket.on("device_disconnected", ({ deviceId }: { deviceId: string }) => {
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    });

    socket.on("device_info_updated", (data: any) => {
      setDevices((prev) =>
        prev.map((d) => (d.id === data.deviceId ? { ...d, ...data } : d))
      );
    });

    socket.on("screen_frame", (data: { deviceId: string; frame: string }) => {
      if (data.deviceId === selectedDeviceRef.current) {
        setScreenFrame(data.frame);
      }
    });

    socket.on("command_result", (data: { deviceId: string; command: string; result: string }) => {
      if (data.deviceId === selectedDeviceRef.current) {
        setCommandResult({ command: data.command, result: data.result, timestamp: Date.now() });
      }
    });

    return () => { socket.disconnect(); };
  }, []);

  const sendCommand = (command: string, payload?: any) => {
    if (!socketRef.current || !selectedDevice) return;
    socketRef.current.emit("send_command", {
      deviceId: selectedDevice,
      command,
      payload,
    });
  };

  return (
    <SocketContext.Provider
      value={{ socket: socketRef.current, isConnected, devices, selectedDevice, setSelectedDevice, sendCommand, screenFrame, setScreenFrame, commandResult }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
