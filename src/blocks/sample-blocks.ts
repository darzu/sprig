import { bast } from "./bast.js";
import { pxtColors } from "./color-bars.js";

export let codeTree_tri_sizing: bast.Stmt[] = [
  {
    kind: "stmt",
    corner: "triangular",
    color: pxtColors["logic"],
    es: [
      {
        kind: "lbl",
        val: "if",
      },
      {
        kind: "exp",
        corner: "triangular",
        color: pxtColors["logic"],
        es: [
          {
            kind: "exp",
            corner: "square",
            color: pxtColors["logic"],
            es: [
              {
                kind: "lbl",
                val: "true",
              },
            ],
          },
        ],
      },
    ],
  },
];
export let codeTree: bast.Stmt[] = [
  {
    kind: "multi",
    color: pxtColors["loops"],
    corner: "square",
    ess: [
      [
        {
          kind: "lbl",
          val: "if something",
        },
      ],
      [
        {
          kind: "stmt",
          corner: "square",
          color: pxtColors["variables"],
          es: [
            {
              kind: "lbl",
              val: "Hello",
            },
            {
              kind: "exp",
              corner: "triangular",
              color: pxtColors["location"],
              es: [
                {
                  kind: "lbl",
                  val: "outer",
                },
                {
                  kind: "exp",
                  corner: "circular",
                  color: pxtColors["functions"],
                  es: [
                    {
                      kind: "lbl",
                      val: "inner",
                    },
                  ],
                },
              ],
            },
            {
              kind: "lbl",
              val: "world!",
            },
          ],
        },
        {
          kind: "stmt",
          corner: "square",
          color: pxtColors["variables"],
          es: [
            {
              kind: "lbl",
              val: "Foobar",
            },
          ],
        },
      ],
    ],
  },
  {
    kind: "stmt",
    corner: "square",
    color: pxtColors["sprites"],
    es: [
      {
        kind: "lbl",
        val: "Hello",
      },
      {
        kind: "exp",
        corner: "circular",
        color: pxtColors["music"],
        es: [
          {
            kind: "lbl",
            val: "boo :)",
          },
        ],
      },
      {
        kind: "lbl",
        val: "world!",
      },
    ],
  },
];
