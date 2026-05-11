"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useEffect, useState } from "react";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Link as LinkIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Minimal rich-text editor for job descriptions. Tiptap + starter-kit + link
 * extension. Emits HTML through an `onChange` callback and (optionally) a
 * hidden input named `name` so it can be picked up by an enclosing
 * <form action={...}> without any client state plumbing in the parent.
 *
 * Allowed marks/blocks: bold, italic, h1/h2/h3, bullet/ordered lists, link.
 * Code blocks, blockquotes, images, tables, etc. are NOT enabled.
 */
export function RichTextEditor({
  name,
  defaultValue,
  value,
  onChange,
  placeholder,
}: {
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
}) {
  const [html, setHtml] = useState<string>(value ?? defaultValue ?? "");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable features we don't expose in the toolbar to keep output
        // predictable and within the sanitization allowlist.
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        code: false,
        strike: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
    ],
    content: value ?? defaultValue ?? "",
    immediatelyRender: false,
    onUpdate({ editor }) {
      const next = editor.getHTML();
      setHtml(next);
      onChange?.(next);
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[150px] max-h-[400px] overflow-y-auto rounded-b-md border-x border-b border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring",
      },
    },
  });

  // Keep editor in sync when a controlled `value` prop changes externally.
  useEffect(() => {
    if (value !== undefined && editor && editor.getHTML() !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
      setHtml(value);
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div className="min-h-[150px] rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
        {placeholder ?? "Cargando editor…"}
      </div>
    );
  }

  return (
    <div>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
      {name ? <input type="hidden" name={name} value={html} /> : null}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-md border border-border bg-muted/40 p-1">
      <Btn
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        label="Negrita"
      >
        <Bold className="h-4 w-4" />
      </Btn>
      <Btn
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        label="Cursiva"
      >
        <Italic className="h-4 w-4" />
      </Btn>
      <Divider />
      <Btn
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        label="Título 1"
      >
        <Heading1 className="h-4 w-4" />
      </Btn>
      <Btn
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        label="Título 2"
      >
        <Heading2 className="h-4 w-4" />
      </Btn>
      <Btn
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        label="Título 3"
      >
        <Heading3 className="h-4 w-4" />
      </Btn>
      <Divider />
      <Btn
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        label="Lista"
      >
        <List className="h-4 w-4" />
      </Btn>
      <Btn
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        label="Lista numerada"
      >
        <ListOrdered className="h-4 w-4" />
      </Btn>
      <Divider />
      <Btn
        active={editor.isActive("link")}
        onClick={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = window.prompt("URL del enlace:", prev ?? "https://");
          if (url === null) return;
          if (url === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
          }
          editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }}
        label="Enlace"
      >
        <LinkIcon className="h-4 w-4" />
      </Btn>
    </div>
  );
}

function Btn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
        active && "bg-background text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-4 w-px bg-border" />;
}
