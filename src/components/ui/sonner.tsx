"use client";

import type React from "react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return <Sonner richColors closeButton position="top-right" {...props} />;
};

export { Toaster };
