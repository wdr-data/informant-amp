const mustacheRender = require('mustache').render;
const fs = require('fs').promises;


const render = async function() {
    const data = {
        report: {
            "id": 696,
            "created": "2018-05-14T04:11:47+02:00",
            "genres": [
                {
                    "id": 8,
                    "name": "Verkehr"
                }
            ],
            "topic": null,
            "tags": [
                {
                    "id": 1267,
                    "name": "Kreuz Leverkusen"
                },
                {
                    "id": 1266,
                    "name": "Dreieck Langenfeld"
                },
                {
                    "id": 1265,
                    "name": "A3"
                },
                {
                    "id": 241,
                    "name": "Autobahn"
                },
                {
                    "id": 1264,
                    "name": "Chaos"
                },
                {
                    "id": 1263,
                    "name": "Stau"
                },
                {
                    "id": 1262,
                    "name": "Wasserbüffel"
                }
            ],
            "headline": "Wasserbüffel legen Verkehr auf A3 lahm",
            "text": "Heute Morgen gab es auf der A3 bei Leverkusen viel Stau 🚘🚘🚘 Dort haben sie ⬆️ für Chaos gesorgt.",
            "media": "https://wdr-tim-cms-prod-media.s3.amazonaws.com/c8b12349-79ae-4ad2-b683-d4e140927d7a.jpg",
            "media_original": "https://wdr-tim-cms-prod-media.s3.amazonaws.com/c8b12349-79ae-4ad2-b683-d4e140927d7a.jpg",
            "media_note": null,
            "published": true,
            "delivered": false
        },
        fragments: [
            {
                "id": 1539,
                "question": "Kühe? 🤔",
                "text": "Nein, das sind Wasserbüffel. 🐃😄 Die sind von einer Weide ausgebüxt und haben mehr als sieben Stunden die A3 zwischen Kreuz Leverkusen und Dreieck Langenfeld komplett blockiert. 🛣️",
                "media_original": null,
                "media": null,
                "media_note": null,
                "link_wiki": null,
                "report": 696
            },
            {
                "id": 1540,
                "question": "Tiere wieder weg?",
                "text": "Ja - die A3 ist wieder frei. Und die Polizei bestimmt froh - denn der Einsatz war echt aufwendig. Die Tiere wurden stundenlang durch eine Art Gehege aus Polizei-Autos und Lastern in Schach gehalten. 🚓🚨 Tierärzte vom Kölner Zoo haben die Büffel dann betäubt, um sie von der Autobahn zu bringen.",
                "media_original": null,
                "media": null,
                "media_note": null,
                "link_wiki": null,
                "report": 696
            }
        ]
    };

    const template = (await fs.readFile('template.html.mustache')).toString();

    process.stdout.write(mustacheRender(template, data));
};

render();