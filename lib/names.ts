// Detección de nombre y apellidos. Sin dependencias (se prueba en local).
//
// Regla: el cliente debe dar su nombre y AL MENOS UN apellido (hay países, p. ej.
// Marruecos o Rumanía, donde se usa uno solo). Para distinguir "José Juan"
// (dos nombres, sin apellido) de "José García" usamos una lista amplia de nombres
// de pila frecuentes en España y entre la clientela internacional de la Costa Blanca.

const GIVEN_NAMES = `
jose juan maria ana antonio manuel francisco david javier daniel carlos jesus miguel angel rafael pedro pablo
alejandro fernando luis sergio jorge alberto alvaro diego adrian ivan ruben oscar raul enrique ramon vicente
andres joaquin santiago victor eduardo mario roberto jaime marcos hugo martin nicolas gonzalo ignacio emilio
salvador guillermo julio agustin felix tomas cristian marc jordi pau pere josep joan xavier oriol arnau albert
lluis enric ferran gerard sergi marti nil biel aleix eric bernat quim toni xavi jaume
carmen isabel dolores pilar teresa rosa cristina marta laura lucia elena sara paula raquel beatriz patricia
silvia sonia monica nuria andrea alicia irene julia claudia natalia eva rocio veronica susana yolanda lorena
angela inmaculada encarnacion mercedes montserrat concepcion josefa francisca antonia amparo esther miriam
noelia alba carla sofia valeria daniela martina olivia emma lara ainhoa leire nerea aitana ariadna nadia
mar rosario soledad milagros consuelo asuncion remedios guadalupe gloria victoria lidia celia ines adriana
jesse joseph john james robert michael william richard thomas charles christopher mark paul steven andrew
kenneth george edward brian ronald anthony kevin jason matthew gary timothy jeffrey ryan jacob nicholas eric
stephen jonathan larry justin scott brandon benjamin samuel gregory frank alexander patrick jack dennis jerry
tyler aaron henry adam peter nathan zachary walter kyle harold carl arthur gerald roger keith jeremy terry
lawrence sean christian austin noah ethan liam oliver harry charlie alfie oscar leo archie freddie theo
mary patricia jennifer linda elizabeth barbara susan jessica sarah karen nancy lisa betty margaret sandra
ashley kimberly emily donna michelle dorothy carol amanda melissa deborah stephanie rebecca sharon kathleen
amy shirley anna brenda pamela nicole samantha katherine christine debra rachel catherine carolyn janet
heather diane ruth julie joyce virginia kelly lauren judith megan cheryl hannah jacqueline martha madison
grace amelia isla ava mia isabella lily chloe ella poppy charlotte jessica lucy
jean pierre michel philippe alain nicolas christophe patrick francois laurent frederic eric stephane olivier
julien sebastien thierry vincent pascal didier bruno gilles jacques claude yves denis marcel andre louis
marie nathalie isabelle sylvie catherine francoise valerie sandrine sophie christine veronique celine
aurelie camille chloe manon pauline juliette helene genevieve brigitte
hans peter klaus jurgen wolfgang michael thomas andreas stefan frank uwe dieter gunter horst werner heinz
karl helmut manfred bernd ralf rainer markus matthias jens tobias florian lukas jonas felix maximilian
ursula ingrid monika petra sabine renate karin gabriele brigitte helga birgit heike anja katrin susanne
jan pieter willem hendrik dirk bram sander thijs ruud koen joost bas daan sem lars sven erik nils ola
anders per bjorn johan magnus henrik karin ingrid astrid sigrid freya linnea elin ebba saga maja
ivan sergei sergey dmitri dmitry alexei alexey andrei andrey vladimir nikolai mikhail pavel yuri oleg igor
anastasia olga tatiana tatyana natalia natasha svetlana elena irina ekaterina yulia anna maria marina
mohamed mohammed muhammad ahmed ahmad ali omar youssef yusuf hassan hussein karim mustafa said rachid
abdel abdellah abdelkader abdul amine mehdi hamza ibrahim ismail khalid nabil samir tarik yassine bilal
fatima fatma zahra zohra khadija aicha aisha amina zineb zainab salma meryem maryam nadia samira layla leila hanane
ion ioan gheorghe vasile constantin dumitru nicolae mihai andrei alexandru adrian florin cristian marius
ionut bogdan razvan catalin dragos cosmin ciprian sorin ovidiu
elena ioana mihaela andreea alexandra cristina daniela gabriela adriana roxana simona georgiana florentina
giuseppe giovanni francesco antonio mario luigi marco andrea alessandro matteo lorenzo luca davide stefano
giulia francesca chiara federica valentina alessia martina sara giorgia
joao pedro tiago rui nuno goncalo duarte afonso
`;

const GIVEN = new Set(GIVEN_NAMES.split(/\s+/).filter(Boolean));

// Partículas que forman parte de un apellido ("de la Fuente", "van Dijk", "El Amrani").
const PARTICLES = new Set(["de", "del", "la", "las", "los", "y", "i", "e", "van", "von", "der", "den", "da", "di", "du", "dos", "das", "le", "el", "al", "ben", "bin", "ibn", "mac", "mc", "st"]);

function norm(w: string): string {
  return w.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z]/g, "");
}

export type NameAnalysis = {
  givenNames: string[];
  surnames: string[];
  hasSurname: boolean;
};

export function analyzeName(full: string | null | undefined): NameAnalysis {
  const words = (full ?? "")
    .replace(/[^\p{L}\s'’-]/gu, " ")
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w));
  if (words.length === 0) return { givenNames: [], surnames: [], hasSurname: false };
  if (words.length === 1) return { givenNames: words, surnames: [], hasSurname: false };

  // Nombres de pila al principio: el primero siempre; los siguientes mientras
  // sean nombres conocidos (José Juan, María del Mar, Jean-Pierre...).
  const given = [words[0]];
  let i = 1;
  while (i < words.length - 1 && GIVEN.has(norm(words[i]))) {
    given.push(words[i]);
    i++;
  }
  // "María del Mar": partícula + nombre conocido sigue siendo nombre de pila.
  while (i < words.length - 1 && PARTICLES.has(norm(words[i])) && GIVEN.has(norm(words[i + 1]))) {
    given.push(words[i], words[i + 1]);
    i += 2;
  }

  let rest = words.slice(i);
  // Si todo lo que queda es un único nombre de pila conocido ("José Juan"), no hay apellido.
  if (rest.length === 1 && GIVEN.has(norm(rest[0]))) {
    return { givenNames: words, surnames: [], hasSurname: false };
  }
  rest = rest.filter((w) => w.length > 0);
  const real = rest.filter((w) => !PARTICLES.has(norm(w)));
  return { givenNames: given, surnames: rest, hasSurname: real.length > 0 };
}
